'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import toast from 'react-hot-toast';
import PortalAPI from '@/lib/api/portalApi';
import { PortalConversationDetail, PortalMessage } from '@/types/portal';
import { initPortalAuth } from '@/lib/portalAuth';
import { buildWsUrl } from '@/lib/ws';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Read-only rich text renderer
function RichBody({ body, isCustomer }: { body: object; isCustomer: boolean }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: body,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none outline-none [&_p]:my-0 [&_ul]:my-1 [&_ol]:my-1 ${isCustomer ? 'prose-invert' : ''}`,
      },
    },
  });

  useEffect(() => {
    editor?.commands.setContent(body);
  }, [editor, body]);

  return <EditorContent editor={editor} />;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-500',
};

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [conversation, setConversation] = useState<PortalConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let aborted = false;

    initPortalAuth().then((token) => {
      if (aborted) return;
      if (!token) {
        router.replace('/portal/login');
        return;
      }

      PortalAPI.getConversation(Number(id))
        .then((data) => { if (!aborted) setConversation(data); })
        .catch(() => { if (!aborted) router.replace('/portal/my-tickets'); })
        .finally(() => { if (!aborted) setLoading(false); });

      const url = buildWsUrl(`/ws/portal/conversations/${id}/`, { token });
      ws = new WebSocket(url);

      ws.onmessage = (event) => {
        if (aborted) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'new_message') {
            setConversation((prev) =>
              prev ? { ...prev, messages: [...prev.messages, data.message as PortalMessage] } : prev
            );
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => console.error('[Portal WS] error');
    });

    return () => {
      aborted = true;
      ws?.close();
    };
  }, [id, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !conversation) return;
    setSending(true);
    try {
      const msg: PortalMessage = await PortalAPI.sendMessage(conversation.id, reply);
      setConversation((prev) =>
        prev ? { ...prev, messages: [...prev.messages, msg] } : prev
      );
      setReply('');
    } catch {
      toast.error('Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse mb-6" />
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!conversation) return null;

  const title = conversation.tags.length > 0 ? conversation.tags[0] : `Ticket #${conversation.id}`;
  const isClosed = conversation.status === 'closed' || conversation.status === 'resolved';

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto px-4">
      {/* Header */}
      <div className="py-4 border-b border-gray-100 bg-gray-50 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/portal/my-tickets')}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-gray-900 text-sm truncate">{title}</h1>
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[conversation.status] ?? ''}`}>
                {conversation.status_display}
              </span>
            </div>
            <p className="text-xs text-gray-400">Opened {formatDate(conversation.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-3">
        {conversation.messages.map((msg) => {
          const isCustomer = msg.sender_type === 'customer';
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
            <div key={msg.id} className={`flex flex-col max-w-[80%] ${isCustomer ? 'self-end items-end' : 'self-start items-start'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs text-gray-400">
                  {isCustomer ? 'You' : (msg.sender_name ?? 'Support Agent')}
                </span>
                <span className="text-xs text-gray-300">{formatTime(msg.created_at)}</span>
              </div>
              <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                isCustomer
                  ? 'bg-[#3CCED7] text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
              }`}>
                {msg.rich_body ? (
                  <RichBody body={msg.rich_body} isCustomer={isCustomer} />
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div className="border-t border-gray-100 py-3 shrink-0">
        {isClosed ? (
          <p className="text-center text-sm text-gray-400 py-2">
            This ticket is {conversation.status}. Open a new ticket if you need further help.
          </p>
        ) : (
          <form onSubmit={handleSend} className="flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder="Type your reply… (Enter to send)"
              rows={1}
              className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-[#3CCED7] resize-none"
              style={{ minHeight: '42px', maxHeight: '120px' }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = `${t.scrollHeight}px`;
              }}
            />
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className="shrink-0 px-4 py-2.5 text-sm font-medium bg-[#3CCED7] text-white rounded-xl hover:bg-[#2bb8c1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? '…' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
