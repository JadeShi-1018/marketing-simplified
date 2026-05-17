'use client';

import React, { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import Layout from '@/components/layout/Layout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import { ExperienceGroupAPI } from '@/lib/api/experienceGroupApi';
import { ExperienceGroupListItem, CreateExperienceGroupData } from '@/types/experienceGroup';
import { Plus, Pencil, Trash2, Send, Eye, AlertCircle } from 'lucide-react';

// ── Create Form (inside Modal) ────────────────────────────────────────────────

interface CreateFormProps {
  onSuccess: (group: ExperienceGroupListItem) => void;
  onCancel: () => void;
}

const CreateForm: React.FC<CreateFormProps> = ({ onSuccess, onCancel }) => {
  const [form, setForm] = useState<CreateExperienceGroupData>({ name: '', description: '' });
  const [errors, setErrors] = useState<Partial<CreateExperienceGroupData>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const validate = (): boolean => {
    const next: Partial<CreateExperienceGroupData> = {};
    if (!form.name.trim()) next.name = 'Group name is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await ExperienceGroupAPI.create(form);
      onSuccess(res.data);
    } catch (err: any) {
      const detail =
        err?.response?.data?.name?.[0] ||
        err?.response?.data?.detail ||
        'Failed to create group. Please try again.';
      setServerError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">
      {serverError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {serverError}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Enterprise Customers"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={submitting}
        />
        {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Describe this experience group..."
          rows={3}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          disabled={submitting}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Group'}
        </button>
      </div>
    </form>
  );
};

// ── Status Badge ──────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: ExperienceGroupListItem['status'] }> = ({ status }) => {
  const styles =
    status === 'PUBLISHED'
      ? 'bg-green-100 text-green-700'
      : 'bg-yellow-100 text-yellow-700';
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles}`}>
      {status === 'PUBLISHED' ? 'Published' : 'Draft'}
    </span>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const ExperienceGroupsPage: React.FC = () => {
  const [groups, setGroups] = useState<ExperienceGroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ExperienceGroupAPI.list();
      setGroups(res.data);
    } catch {
      setError('Failed to load experience groups. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreated = (newGroup: ExperienceGroupListItem) => {
    setGroups((prev) => [newGroup, ...prev]);
    setIsCreateModalOpen(false);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Delete "${name}"? This action cannot be undone.`)) return;
    setDeletingId(id);
    setActionError(null);
    try {
      await ExperienceGroupAPI.destroy(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        'Could not delete this group. It may be referenced by an active channel or routing rule.';
      setActionError(detail);
    } finally {
      setDeletingId(null);
    }
  };

  const handlePublish = async (id: number) => {
    setPublishingId(id);
    setActionError(null);
    try {
      const res = await ExperienceGroupAPI.publish(id);
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, status: res.data.status } : g))
      );
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        'Could not publish this group.';
      setActionError(detail);
    } finally {
      setPublishingId(null);
    }
  };

  const handlePreview = (id: number) => {
    window.open(`/admin/experience-groups/${id}/preview`, '_blank');
  };

  return (
    <ProtectedRoute requiredAuth={true} fallback="/unauthorized">
      <Layout>
        <div className="p-8 flex flex-col gap-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Experience Groups</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage distinct support configurations for different customer segments.
              </p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Group
            </button>
          </div>

          {/* Action-level error */}
          {actionError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {actionError}
              <button
                onClick={() => setActionError(null)}
                className="ml-auto text-red-500 hover:text-red-700 text-xs underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
              <LoadingSpinner />
              <p className="text-sm text-gray-500">Loading experience groups...</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <button
                onClick={fetchGroups}
                className="px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded-lg hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 border-2 border-dashed border-gray-200 rounded-xl">
              <p className="text-gray-400 text-sm">No experience groups yet.</p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50"
              >
                <Plus className="h-4 w-4" />
                Create your first group
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Description</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Last Updated</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groups.map((group) => (
                    <tr key={group.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 font-medium text-gray-900">{group.name}</td>
                      <td className="px-5 py-4 text-gray-500 max-w-xs truncate">
                        {group.description || <span className="italic text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={group.status} />
                      </td>
                      <td className="px-5 py-4 text-gray-400">
                        {new Date(group.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {/* Preview */}
                          <button
                            onClick={() => handlePreview(group.id)}
                            title="Preview"
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* Edit */}
                          <a
                            href={`/admin/experience-groups/${group.id}/edit`}
                            title="Edit"
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </a>

                          {/* Publish (only if DRAFT) */}
                          {group.status === 'DRAFT' && (
                            <button
                              onClick={() => handlePublish(group.id)}
                              disabled={publishingId === group.id}
                              title="Publish"
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors disabled:opacity-40"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          )}

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(group.id, group.name)}
                            disabled={deletingId === group.id}
                            title="Delete"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create Modal */}
        <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">New Experience Group</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Configure a distinct support experience for a customer segment.
              </p>
            </div>
            <CreateForm
              onSuccess={handleCreated}
              onCancel={() => setIsCreateModalOpen(false)}
            />
          </div>
        </Modal>
      </Layout>
    </ProtectedRoute>
  );
};

export default ExperienceGroupsPage;
