'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { OrganisationAPI } from '@/lib/api/organisationAPI';
import { QuickReplyTemplateAPI } from '@/lib/api/csmConversationApi';
import type { QuickReplyTemplate } from '@/types/csmConversation';
import { Plus, Pencil, Trash2, Tag, Search, X } from 'lucide-react';

interface TemplateFormState {
  title: string;
  content: string;
  tags: string;
}

const EMPTY_FORM: TemplateFormState = { title: '', content: '', tags: '' };

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: QuickReplyTemplate;
  onEdit: (t: QuickReplyTemplate) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-medium text-gray-900 text-sm leading-snug">{template.title}</h3>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onEdit(template)}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(template.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 line-clamp-3 mb-3 leading-relaxed">{template.content}</p>
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
  );
}

function TemplateModal({
  open,
  initial,
  orgId,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: QuickReplyTemplate | null;
  orgId: number;
  onClose: () => void;
  onSaved: (t: QuickReplyTemplate) => void;
}) {
  const [form, setForm] = useState<TemplateFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? { title: initial.title, content: initial.content, tags: initial.tags.join(', ') }
          : EMPTY_FORM
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
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      let saved: QuickReplyTemplate;
      if (initial) {
        saved = await QuickReplyTemplateAPI.update(initial.id, {
          title: form.title.trim(),
          content: form.content.trim(),
          tags,
        });
      } else {
        saved = await QuickReplyTemplateAPI.create({
          organisation: orgId,
          title: form.title.trim(),
          content: form.content.trim(),
          tags,
        });
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900">{initial ? 'Edit Template' : 'New Template'}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Greeting, Refund Policy, …"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Content *</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              rows={5}
              placeholder="The reply text that will be inserted into the composer…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tags <span className="font-normal text-gray-400">(comma-separated, optional)</span>
            </label>
            <input
              value={form.tags}
              onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
              placeholder="e.g. refund, billing, greeting"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 mt-1">
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

function TemplatesPageContent() {
  const [adminOrgs, setAdminOrgs] = useState<{ id: number; name: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [templates, setTemplates] = useState<QuickReplyTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<QuickReplyTemplate | null>(null);

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

  // Collect all tags from loaded templates
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
                <TemplateCard key={t.id} template={t} onEdit={handleEdit} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>

        {selectedOrgId && (
          <TemplateModal
            open={modalOpen}
            initial={editTarget}
            orgId={selectedOrgId}
            onClose={() => { setModalOpen(false); setEditTarget(null); }}
            onSaved={handleSaved}
          />
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}

export default TemplatesPageContent;
