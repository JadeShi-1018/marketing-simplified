'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CsmConversationAPI, { QuickReplyTemplateAPI } from '@/lib/api/csmConversationApi';
import { useCsmConversationStore } from '@/lib/csmConversationStore';
import type { QuickReplyTemplate } from '@/types/csmConversation';
import { Tag, Search, X, Bold, Italic, List, ListOrdered, LayoutTemplate, ImagePlus } from 'lucide-react';

interface ConversationComposerProps {
  conversationId: number;
  organisationId?: number | null;
  onTyping?: (isTyping: boolean) => void;
}

// ---------------------------------------------------------------------------
// TemplatePicker
// ---------------------------------------------------------------------------
function TemplatePicker({
  organisationId,
  onSelect,
  onClose,
}: {
  organisationId: number;
  onSelect: (template: QuickReplyTemplate) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<QuickReplyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [previewId, setPreviewId] = useState<number | null>(null);

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

  const previewTemplate = previewId !== null ? templates.find((t) => t.id === previewId) : null;

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-md mb-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-medium text-gray-600">
          {previewTemplate ? `Preview: ${previewTemplate.title}` : 'Quick Reply Templates'}
        </span>
        <div className="flex items-center gap-1">
          {previewTemplate && (
            <button
              onClick={() => setPreviewId(null)}
              className="text-[10px] px-2 py-0.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              ← Back
            </button>
          )}
          <button onClick={onClose} className="p-0.5 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
      </div>

      {previewTemplate ? (
        /* Full preview */
        <div className="p-3 max-h-64 overflow-y-auto flex flex-col gap-3">
          {previewTemplate.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {previewTemplate.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded-full">
                  <Tag size={8} />
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{previewTemplate.content}</p>
          <button
            onClick={() => { onSelect(previewTemplate); setPreviewId(null); }}
            className="self-end text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            Insert
          </button>
        </div>
      ) : (
        <>
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
                <div
                  key={t.id}
                  className="flex items-start gap-2 px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors group"
                >
                  <button onClick={() => onSelect(t)} className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-gray-800">{t.title}</span>
                      {t.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded-full">
                          <Tag size={8} />{tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{t.content}</p>
                  </button>
                  <button
                    onClick={() => setPreviewId(t.id)}
                    className="shrink-0 text-[10px] px-1.5 py-0.5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                  >
                    Preview
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConversationComposer
// ---------------------------------------------------------------------------
export function ConversationComposer({
  conversationId,
  organisationId,
  onTyping,
}: ConversationComposerProps) {
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const addMessage = useCsmConversationStore((s) => s.addMessage);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Type a reply… (Enter to send, Shift+Enter for new line)' }),
    ],
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'outline-none text-sm text-gray-900 min-h-[24px] max-h-36 overflow-y-auto prose prose-sm max-w-none [&_p]:my-0',
      },
    },
    onUpdate({ editor }) {
      onTyping?.(!editor.isEmpty);
    },
  });

  // Handle Enter key to send
  useEffect(() => {
    if (!editor) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    };
    editor.view.dom.addEventListener('keydown', handleKeyDown);
    return () => editor.view.dom.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, sending, conversationId]);

  const handleSend = useCallback(async () => {
    if (!editor) return;
    const plainText = editor.getText().trim();
    if (!plainText && !imageFile) return;
    if (sending) return;

    const richBody = editor.getJSON();
    setSending(true);
    try {
      const msg = await CsmConversationAPI.sendMessage(conversationId, {
        content: plainText,
        rich_body: imageFile ? null : richBody,
        image: imageFile,
      });
      addMessage(conversationId, msg);
      editor.commands.clearContent(true);
      clearImage();
      onTyping?.(false);
    } catch (err) {
      console.error('Failed to send message', err);
    } finally {
      setSending(false);
    }
  }, [editor, sending, conversationId, addMessage, onTyping, imageFile]);

  const handleInsertTemplate = useCallback((template: QuickReplyTemplate) => {
    if (!editor) return;
    if (template.rich_body) {
      // Replace entire editor content with the template's rich body
      editor.commands.setContent(template.rich_body as Parameters<typeof editor.commands.setContent>[0]);
    } else {
      editor.commands.insertContent(template.content);
    }
    setShowTemplates(false);
    editor.commands.focus();
  }, [editor]);

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

      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        {/* Formatting toolbar */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
          {(
            [
              { cmd: 'toggleBold', active: 'bold', icon: <Bold size={14} />, title: 'Bold' },
              { cmd: 'toggleItalic', active: 'italic', icon: <Italic size={14} />, title: 'Italic' },
            ] as const
          ).map(({ cmd, active, icon, title }) => (
            <button
              key={cmd}
              type="button"
              title={title}
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus()[cmd]().run(); }}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                editor?.isActive(active)
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'
              }`}
            >
              {icon}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-200 mx-1" />
          {(
            [
              { cmd: 'toggleBulletList', active: 'bulletList', icon: <List size={14} />, title: 'Bullet list' },
              { cmd: 'toggleOrderedList', active: 'orderedList', icon: <ListOrdered size={14} />, title: 'Ordered list' },
            ] as const
          ).map(({ cmd, active, icon, title }) => (
            <button
              key={cmd}
              type="button"
              title={title}
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus()[cmd]().run(); }}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                editor?.isActive(active)
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'
              }`}
            >
              {icon}
            </button>
          ))}
          <div className="flex-1" />
          {/* Image upload button */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            title="Attach image"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              imageFile ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'
            }`}
          >
            <ImagePlus size={14} />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          {/* Template button */}
          <button
            type="button"
            onClick={() => setShowTemplates((v) => !v)}
            title="Insert quick reply template"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              showTemplates ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'
            }`}
          >
            <LayoutTemplate size={14} />
          </button>
        </div>

        {/* Image preview */}
        {imagePreview && (
          <div className="px-3 pb-2 flex items-start gap-2">
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="preview" className="max-h-32 max-w-[200px] rounded-lg object-cover border border-gray-200" />
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

        {/* Editor + Send */}
        <div className="flex items-end gap-2 px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <EditorContent editor={editor} />
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="shrink-0 rounded-lg bg-brand-agent px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-agent-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
