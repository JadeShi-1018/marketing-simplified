'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import CsmConversationAPI, { QuickReplyTemplateAPI } from '@/lib/api/csmConversationApi';
import { useCsmConversationStore } from '@/lib/csmConversationStore';
import type { QuickReplyTemplate } from '@/types/csmConversation';
import { Tag, Search, X } from 'lucide-react';

interface ConversationComposerProps {
  conversationId: number;
  organisationId?: number | null;
  onTyping?: (isTyping: boolean) => void;
}

function TemplatePicker({
  organisationId,
  onSelect,
  onClose,
}: {
  organisationId: number;
  onSelect: (content: string) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<QuickReplyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');

  useEffect(() => {
    QuickReplyTemplateAPI.list({ organisation: organisationId })
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [organisationId]);

  const allTags = Array.from(new Set(templates.flatMap((t) => t.tags))).sort();

  const filtered = templates.filter((t) => {
    const matchesSearch =
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.content.toLowerCase().includes(search.toLowerCase());
    const matchesTag = !filterTag || t.tags.includes(filterTag);
    return matchesSearch && matchesTag;
  });

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-md mb-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-medium text-gray-600">Quick Reply Templates</span>
        <button onClick={onClose} className="p-0.5 text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-3 py-2 border-b border-gray-100">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full pl-6 pr-2 py-1 text-xs rounded border border-gray-200 outline-none focus:border-blue-400"
          />
        </div>
        {allTags.length > 0 && (
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="text-xs rounded border border-gray-200 px-2 py-1 outline-none focus:border-blue-400 bg-white"
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        )}
      </div>

      {/* Template list */}
      <div className="max-h-52 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-4 text-xs text-gray-400 text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-gray-400 text-center">
            {search || filterTag ? 'No matches.' : 'No templates yet. Create some in CSM → Templates.'}
          </div>
        ) : (
          filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.content)}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-xs font-medium text-gray-800">{t.title}</span>
                {t.tags.length > 0 && (
                  <div className="flex gap-1 shrink-0">
                    {t.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded-full">
                        <Tag size={8} />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{t.content}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function ConversationComposer({
  conversationId,
  organisationId,
  onTyping,
}: ConversationComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const addMessage = useCsmConversationStore((s) => s.addMessage);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setText(value);
      onTyping?.(value.length > 0);
    },
    [onTyping]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, conversationId]
  );

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      const msg = await CsmConversationAPI.sendMessage(conversationId, { content: trimmed });
      addMessage(conversationId, msg);
      setText('');
      onTyping?.(false);
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err) {
      console.error('Failed to send message', err);
    } finally {
      setSending(false);
    }
  }, [text, sending, conversationId, addMessage, onTyping]);

  const handleInsertTemplate = useCallback((content: string) => {
    setText((prev) => (prev ? prev + '\n' + content : content));
    setShowTemplates(false);
    // Focus textarea after inserting
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {/* Template picker panel */}
      {showTemplates && organisationId && (
        <TemplatePicker
          organisationId={organisationId}
          onSelect={handleInsertTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}

      <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
        {/* Template button */}
        <button
          type="button"
          onClick={() => setShowTemplates((v) => !v)}
          title="Insert template"
          className={`shrink-0 transition-colors mb-1 ${showTemplates ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 6h16M4 10h12M4 14h8M4 18h6" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a reply... (Enter to send, Shift+Enter for new line)"
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none min-h-[24px] max-h-40"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = `${target.scrollHeight}px`;
          }}
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="shrink-0 mb-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
