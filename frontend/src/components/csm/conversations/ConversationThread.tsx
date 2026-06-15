'use client';

import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ConversationMessage, MessageSenderType } from '@/types/csmConversation';
import { cn } from '@/lib/utils';

const SENDER_LABELS: Record<MessageSenderType, string> = {
  agent: 'Agent',
  customer: 'Customer',
  system: 'System',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Read-only rich text renderer using Tiptap
function RichMessageBody({ body, isAgent }: { body: object; isAgent: boolean }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: body,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: isAgent ? 'csm-rich-dark text-sm' : 'csm-rich-light text-sm text-gray-900',
      },
    },
  });

  useEffect(() => {
    editor?.commands.setContent(body);
  }, [editor, body]);

  return <EditorContent editor={editor} />;
}

interface ConversationThreadProps {
  messages: ConversationMessage[];
  typingUserIds?: number[];
}

export function ConversationThread({ messages, typingUserIds = [] }: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
        No messages yet. Start the conversation.
      </div>
    );
  }

  // Group consecutive messages from the same sender
  type Group = { senderType: MessageSenderType; messages: ConversationMessage[] };
  const groups: Group[] = [];
  for (const msg of messages) {
    if (msg.sender_type === 'system') {
      groups.push({ senderType: 'system', messages: [msg] });
    } else {
      const last = groups[groups.length - 1];
      if (last && last.senderType === msg.sender_type && last.senderType !== 'system') {
        last.messages.push(msg);
      } else {
        groups.push({ senderType: msg.sender_type, messages: [msg] });
      }
    }
  }

  // Date divider tracking
  let lastDate = '';

  return (
    <div className="flex flex-col flex-1 overflow-y-auto px-4 py-4 gap-4">
      {groups.map((group, gi) => {
        if (group.senderType === 'system') {
          const msg = group.messages[0];
          return (
            <div key={msg.id} className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400 px-2 shrink-0">{msg.content}</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
          );
        }

        const isAgent = group.senderType === 'agent';
        const senderLabel = isAgent
          ? (group.messages[0].sender_agent_name ?? SENDER_LABELS.agent)
          : SENDER_LABELS.customer;

        // Check if we need a date divider before this group
        const firstMsgDate = formatDate(group.messages[0].created_at);
        const showDateDivider = firstMsgDate !== lastDate;
        if (showDateDivider) lastDate = firstMsgDate;

        return (
          <React.Fragment key={gi}>
            {showDateDivider && (
              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[11px] text-gray-400 font-medium px-2 shrink-0">{firstMsgDate}</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
            )}

            <div className={cn('flex flex-col gap-1', isAgent ? 'items-end' : 'items-start')}>
              {/* Sender label — shown once per group */}
              <span className="text-xs text-gray-400 px-1">{senderLabel}</span>

              {/* Bubbles */}
              {group.messages.map((msg, mi) => {
                const isLast = mi === group.messages.length - 1;
                return (
                  <div
                    key={msg.id}
                    className={cn('group relative max-w-[75%]')}
                  >
                    <div
                      className={cn(
                        'rounded-2xl text-sm shadow-sm transition-shadow hover:shadow-md overflow-hidden',
                        isAgent
                          ? cn(
                              'bg-brand-agent text-white',
                              isLast ? 'rounded-br-sm' : 'rounded-br-md',
                            )
                          : cn(
                              'bg-white border border-gray-200 text-gray-900',
                              isLast ? 'rounded-bl-sm' : 'rounded-bl-md',
                            ),
                      )}
                    >
                      {msg.image_url ? (
                        <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={msg.image_url}
                            alt="image"
                            className="max-w-[260px] max-h-[200px] object-cover block"
                          />
                        </a>
                      ) : msg.rich_body ? (
                        <div className="px-4 py-2.5">
                          <RichMessageBody body={msg.rich_body} isAgent={isAgent} />
                        </div>
                      ) : (
                        <div className="px-4 py-2.5">
                          <span className="whitespace-pre-wrap leading-relaxed">{msg.content}</span>
                        </div>
                      )}
                    </div>
                    {/* Timestamp — visible on hover */}
                    <span
                      className={cn(
                        'absolute top-1/2 -translate-y-1/2 text-[11px] text-gray-400 whitespace-nowrap',
                        'opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none',
                        isAgent ? 'right-[calc(100%+8px)]' : 'left-[calc(100%+8px)]',
                      )}
                    >
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          </React.Fragment>
        );
      })}

      {typingUserIds.length > 0 && (
        <div className="self-start flex items-center gap-1.5 text-xs text-gray-400 px-2 py-1">
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '-0.3s' }} />
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '-0.15s' }} />
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" />
          </span>
          <span>typing…</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
