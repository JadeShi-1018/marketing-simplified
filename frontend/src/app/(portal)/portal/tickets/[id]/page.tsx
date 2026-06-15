'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import toast from 'react-hot-toast';
import PortalAPI from '@/lib/api/portalApi';
import { PortalConversationDetail, PortalMessage } from '@/types/portal';
import { initPortalAuth } from '@/lib/portalAuth';
import { buildWsUrl } from '@/lib/ws';
import { ImagePlus, X } from 'lucide-react';

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
        class: isCustomer ? 'csm-rich-dark text-sm' : 'csm-rich-light text-sm text-gray-900',
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, []);

  const clearImage = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

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
    if (!reply.trim() && !imageFile) return;
    if (!conversation) return;
    setSending(true);
    try {
      const msg: PortalMessage = await PortalAPI.sendMessage(conversation.id, reply, imageFile ?? undefined);
      setConversation((prev) =>
        prev ? { ...prev, messages: [...prev.messages, msg] } : prev
      );
      setReply('');
      clearImage();
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
              <div key={msg.id} className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[11px] text-gray-400 px-2 shrink-0">{msg.content}</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
            );
          }

          return (
            <div key={msg.id} className={`group flex flex-col max-w-[75%] ${isCustomer ? 'self-end items-end' : 'self-start items-start'}`}>
              <span className="text-xs text-gray-400 px-1 mb-1">
                {isCustomer ? 'You' : (msg.sender_name ?? 'Support Agent')}
              </span>
              <div className="relative">
                <div className={`rounded-2xl text-sm shadow-sm hover:shadow-md transition-shadow overflow-hidden ${
                  isCustomer
                    ? 'bg-brand-teal text-white rounded-br-sm'
                    : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
                }`}>
                  {msg.image_url ? (
                    <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.image_url}
                        alt="image"
                        className="max-w-[220px] max-h-[180px] object-cover block"
                      />
                    </a>
                  ) : msg.rich_body ? (
                    <div className="px-4 py-2.5">
                      <RichBody body={msg.rich_body} isCustomer={isCustomer} />
                    </div>
                  ) : (
                    <div className="px-4 py-2.5">
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    </div>
                  )}
                </div>
                <span className={`absolute top-1/2 -translate-y-1/2 text-[11px] text-gray-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${
                  isCustomer ? 'right-[calc(100%+8px)]' : 'left-[calc(100%+8px)]'
                }`}>
                  {formatTime(msg.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div className="border-t border-gray-100 py-3 shrink-0">
        {isClosed ? (
          <p className="text-center text-xs text-gray-400 py-2 bg-gray-50 rounded-xl">
            This ticket is <span className="font-medium">{conversation.status}</span>. Open a new ticket if you need further help.
          </p>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden focus-within:border-brand-teal focus-within:ring-2 focus-within:ring-brand-teal/20 transition">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder="Type your reply… (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="w-full bg-transparent px-4 py-2.5 text-sm outline-none resize-none min-h-[42px] max-h-[120px]"
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
              }}
            />
            {imagePreview && (
              <div className="px-3 pb-2 flex items-start gap-2">
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="preview" className="max-h-24 max-w-[160px] rounded-lg object-cover border border-gray-200" />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                title="Attach image"
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                  imageFile ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:text-brand-teal hover:bg-gray-100'
                }`}
              >
                <ImagePlus size={15} />
              </button>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              <button
                onClick={(e) => handleSend(e as unknown as React.FormEvent)}
                disabled={sending || (!reply.trim() && !imageFile)}
                className="px-4 py-1.5 text-xs font-medium bg-brand-teal text-white rounded-lg hover:bg-brand-teal-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
