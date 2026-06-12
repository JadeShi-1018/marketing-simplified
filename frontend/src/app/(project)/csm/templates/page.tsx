'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { OrganisationAPI } from '@/lib/api/organisationAPI';
import api from '@/lib/api';
import { QuickReplyTemplateAPI } from '@/lib/api/csmConversationApi';
import type { QuickReplyTemplate, QuickReplyTemplateHistory } from '@/types/csmConversation';

interface TeamOption { id: number; name: string; }
import { Plus, Pencil, Trash2, Tag, Search, X, History, ChevronDown, ChevronUp, Bold, Italic, List } from 'lucide-react';

// ---------------------------------------------------------------------------
// TagInput — chip-style tag editor with suggestions
// ---------------------------------------------------------------------------
function TagInput({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInput('');
    setShowSuggestions(false);
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const filteredSuggestions = suggestions.filter(
    (s) => s.includes(input.toLowerCase()) && !value.includes(s)
  );

  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className="min-h-[38px] flex flex-wrap gap-1 p-2 rounded-lg border border-gray-200 bg-white cursor-text focus-within:border-blue-400"
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full"
          >
            <Tag size={10} />
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="text-blue-400 hover:text-blue-700 leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
              e.preventDefault();
              addTag(input);
            } else if (e.key === 'Backspace' && !input && value.length > 0) {
              removeTag(value[value.length - 1]);
            }
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={value.length === 0 ? 'Add tags… (Enter or comma to add)' : ''}
          className="flex-1 min-w-[80px] text-xs outline-none bg-transparent placeholder-gray-300"
        />
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-md max-h-32 overflow-y-auto">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={() => addTag(s)}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RichTextEditor — simple Tiptap editor for template body
// ---------------------------------------------------------------------------
function RichTextEditor({
  content,
  onChange,
  placeholder,
}: {
  content: string;
  onChange: (plain: string, json: object) => void;
  placeholder?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? 'Write template content…' }),
    ],
    content,
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChange(editor.getText(), editor.getJSON());
    },
  });

  if (!mounted) {
    return (
      <div className="rounded-lg border border-gray-200 min-h-[148px] bg-gray-50 animate-pulse" />
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 focus-within:border-blue-400 overflow-hidden">
      {/* Mini toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-100 bg-gray-50">
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`p-1 rounded text-xs ${editor?.isActive('bold') ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
          title="Bold"
        >
          <Bold size={13} />
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`p-1 rounded text-xs ${editor?.isActive('italic') ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
          title="Italic"
        >
          <Italic size={13} />
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={`p-1 rounded text-xs ${editor?.isActive('bulletList') ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
          title="Bullet list"
        >
          <List size={13} />
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-3 py-2 text-sm text-gray-900 min-h-[120px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[100px]"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HistoryModal — shows edit history for a template
// ---------------------------------------------------------------------------
function HistoryModal({
  template,
  onClose,
}: {
  template: QuickReplyTemplate;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<QuickReplyTemplateHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    QuickReplyTemplateAPI.history(template.id)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [template.id]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Edit History</h2>
            <p className="text-xs text-gray-400 mt-0.5">#{template.id} {template.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">No edits recorded yet.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((entry) => (
                <div key={entry.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{entry.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {entry.edited_by_name ?? 'Unknown'} · {fmt(entry.edited_at)}
                      </p>
                    </div>
                    {expandedId === entry.id ? (
                      <ChevronUp size={14} className="text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown size={14} className="text-gray-400 shrink-0" />
                    )}
                  </button>
                  {expandedId === entry.id && (
                    <div className="px-4 pb-3 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-500 mt-2 mb-1">Content snapshot:</p>
                      <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded p-2">
                        {entry.content}
                      </p>
                      {entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {entry.tags.map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded-full">
                              <Tag size={8} />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TemplateCard
// ---------------------------------------------------------------------------
function TemplateCard({
  template,
  onEdit,
  onDelete,
  onHistory,
}: {
  template: QuickReplyTemplate;
  onEdit: (t: QuickReplyTemplate) => void;
  onDelete: (id: number) => void;
  onHistory: (t: QuickReplyTemplate) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-medium text-gray-900 text-sm leading-snug">{template.title}</h3>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onHistory(template)}
            className="p-1.5 text-gray-400 hover:text-purple-500 rounded transition-colors"
            title="Edit history"
          >
            <History size={14} />
          </button>
          <button
            onClick={() => onEdit(template)}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded transition-colors"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(template.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 line-clamp-3 mb-3 leading-relaxed">{template.content}</p>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {template.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full"
              >
                <Tag size={10} />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TemplateModal — create / edit with Tiptap, team selector, chip tags
// ---------------------------------------------------------------------------
interface TemplateFormState {
  title: string;
  content: string;
  rich_body: object | null;
  tags: string[];
  team: number | null;
}

function TemplateModal({
  open,
  initial,
  orgId,
  teams,
  allTags,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: QuickReplyTemplate | null;
  orgId: number;
  teams: TeamOption[];
  allTags: string[];
  onClose: () => void;
  onSaved: (t: QuickReplyTemplate) => void;
}) {
  const [form, setForm] = useState<TemplateFormState>({
    title: '', content: '', rich_body: null, tags: [], team: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              title: initial.title,
              content: initial.content,
              rich_body: initial.rich_body,
              tags: initial.tags,
              team: initial.team,
            }
          : { title: '', content: '', rich_body: null, tags: [], team: null }
      );
      setError(null);
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let saved: QuickReplyTemplate;
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        rich_body: form.rich_body,
        tags: form.tags,
        team: form.team,
      };
      if (initial) {
        saved = await QuickReplyTemplateAPI.update(initial.id, payload);
      } else {
        saved = await QuickReplyTemplateAPI.create({ organisation: orgId, ...payload });
      }
      onSaved(saved);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-semibold text-gray-900">{initial ? 'Edit Template' : 'New Template'}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5 overflow-y-auto flex-1">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Greeting, Refund Policy, …"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>

          {/* Rich-text content */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Content *</label>
            <RichTextEditor
              content={form.content}
              onChange={(plain, json) => setForm((p) => ({ ...p, content: plain, rich_body: json }))}
              placeholder="The reply text that will be inserted into the composer…"
            />
          </div>

          {/* Team scoping */}
          {teams.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Visible to team <span className="font-normal text-gray-400">(leave blank for everyone)</span>
              </label>
              <select
                value={form.team ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, team: e.target.value ? Number(e.target.value) : null }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"
              >
                <option value="">All agents</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tags <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <TagInput
              value={form.tags}
              onChange={(tags) => setForm((p) => ({ ...p, tags }))}
              suggestions={allTags}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
function TemplatesPageContent() {
  const [adminOrgs, setAdminOrgs] = useState<{ id: number; name: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [templates, setTemplates] = useState<QuickReplyTemplate[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<QuickReplyTemplate | null>(null);
  const [historyTarget, setHistoryTarget] = useState<QuickReplyTemplate | null>(null);

  // Load orgs on mount
  useEffect(() => {
    OrganisationAPI.myAdminOrgs()
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        setAdminOrgs(data);
        if (data.length > 0) setSelectedOrgId(data[0].id);
      })
      .catch(() => {});
  }, []);

  // Load teams for scoping selector
  useEffect(() => {
    api.get<TeamOption[]>('/api/teams/')
      .then((res) => setTeams(Array.isArray(res.data) ? res.data : (res.data as { results?: TeamOption[] })?.results ?? []))
      .catch(() => setTeams([]));
  }, []);

  // Load templates when org changes
  const loadTemplates = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const data = await QuickReplyTemplateAPI.list({ organisation: selectedOrgId });
      setTemplates(data);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Collect all tags from loaded templates (for suggestions + filter)
  const allTags = Array.from(new Set(templates.flatMap((t) => t.tags))).sort();

  // Client-side filter
  const filtered = templates.filter((t) => {
    const matchesSearch =
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.content.toLowerCase().includes(search.toLowerCase());
    const matchesTag = !filterTag || t.tags.includes(filterTag);
    return matchesSearch && matchesTag;
  });

  const handleEdit = (t: QuickReplyTemplate) => {
    setEditTarget(t);
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this template?')) return;
    try {
      await QuickReplyTemplateAPI.remove(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      alert('Failed to delete.');
    }
  };

  const handleSaved = (saved: QuickReplyTemplate) => {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setModalOpen(false);
    setEditTarget(null);
  };

  return (
    <ProtectedRoute>
      <DashboardLayout hideRightPanel>
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Quick Reply Templates</h1>
              <p className="text-xs text-gray-400 mt-0.5">Pre-written replies agents can insert into the composer</p>
            </div>
            <button
              onClick={() => { setEditTarget(null); setModalOpen(true); }}
              disabled={!selectedOrgId}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
            >
              <Plus size={15} />
              New Template
            </button>
          </div>

          {/* Org selector + filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            {adminOrgs.length > 1 && (
              <select
                value={selectedOrgId ?? ''}
                onChange={(e) => setSelectedOrgId(Number(e.target.value))}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"
              >
                {adminOrgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            )}

            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-400"
              />
            </div>

            {allTags.length > 0 && (
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"
              >
                <option value="">All tags</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            )}
          </div>

          {/* Template grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-36 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm mb-4">
                {search || filterTag ? 'No templates match your filter.' : 'No templates yet.'}
              </p>
              {!search && !filterTag && selectedOrgId && (
                <button
                  onClick={() => { setEditTarget(null); setModalOpen(true); }}
                  className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create your first template
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onHistory={setHistoryTarget}
                />
              ))}
            </div>
          )}
        </div>

        {/* Template create/edit modal */}
        {selectedOrgId && (
          <TemplateModal
            open={modalOpen}
            initial={editTarget}
            orgId={selectedOrgId}
            teams={teams}
            allTags={allTags}
            onClose={() => { setModalOpen(false); setEditTarget(null); }}
            onSaved={handleSaved}
          />
        )}

        {/* History modal */}
        {historyTarget && (
          <HistoryModal
            template={historyTarget}
            onClose={() => setHistoryTarget(null)}
          />
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}

export default TemplatesPageContent;
