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

// Read-only rich text renderer using Tiptap
function RichMessageBody({ body, isAgent }: { body: object; isAgent: boolean }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: body,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none outline-none [&_p]:my-0 [&_ul]:my-1 [&_ol]:my-1',
          isAgent ? 'prose-invert' : ''
        ),
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

  return (
    <div className="flex flex-col flex-1 overflow-y-auto px-4 py-4 gap-3">
      {messages.map((msg) => {
        const isAgent = msg.sender_type === 'agent';
        const isSystem = msg.sender_type === 'system';

        if (isSystem) {
          return (
            <div key={msg.id} className="flex justify-center">
              <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                {msg.content}
              </span>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={cn('flex flex-col max-w-[70%]', isAgent ? 'self-end items-end' : 'self-start items-start')}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-400">
                {isAgent ? (msg.sender_agent_name ?? SENDER_LABELS.agent) : SENDER_LABELS.customer}
              </span>
              <span className="text-xs text-gray-300">{formatTime(msg.created_at)}</span>
            </div>
            <div
              className={cn(
                'rounded-2xl px-4 py-2 text-sm',
                isAgent
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-900 rounded-bl-sm'
              )}
            >
              {msg.rich_body ? (
                <RichMessageBody body={msg.rich_body} isAgent={isAgent} />
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
          </div>
        );
      })}

      {typingUserIds.length > 0 && (
        <div className="self-start flex items-center gap-1 text-xs text-gray-400 px-2">
          <span className="inline-flex gap-0.5">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
          </span>
          typing...
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
