'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import CsmAPI from '@/lib/api/csmApi';
import {
  CustomerUser, CreateCustomerUserData, CustomerUserType,
  USER_TYPE_LABELS, USER_TYPE_COLORS, Queue,
} from '@/types/csm';
import { Organisation } from '@/types/organisation';
import { OrganisationAPI } from '@/lib/api/organisationAPI';
import { useRouter } from 'next/navigation';
import { useActiveProjectForFlatRoute } from '@/lib/useActiveProjectForFlatRoute';
import { Plus, Pencil, Trash2, AlertCircle, ArrowLeft, Users, X } from 'lucide-react';

// ── Create Form ──────────────────────────────────────────────────────────────

interface CreateFormProps {
  queues: Queue[];
  organisations: Organisation[];
  onSuccess: (cu: CustomerUser) => void;
  onCancel: () => void;
}

const CreateForm: React.FC<CreateFormProps> = ({ queues, organisations, onSuccess, onCancel }) => {
  const [email, setEmail] = useState('');
  const [queueId, setQueueId] = useState<number | ''>('');
  const [orgId, setOrgId] = useState<number | ''>('');
  const [userType, setUserType] = useState<CustomerUserType>('agent');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Email is required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const data: CreateCustomerUserData = {
        email: email.trim(),
        queue: queueId === '' ? null : queueId,
        organisation: orgId === '' ? null : orgId,
        user_type: userType,
      };
      const result = await CsmAPI.createCustomerUser(data);
      onSuccess(result);
    } catch (err: any) {
      const detail =
        err?.response?.data?.email?.[0] ||
        err?.response?.data?.non_field_errors?.[0] ||
        err?.response?.data?.detail ||
        'Failed to create user assignment.';
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter user email"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={submitting}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">User Type</label>
          <select
            value={userType}
            onChange={(e) => setUserType(e.target.value as CustomerUserType)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            disabled={submitting}
          >
            {(Object.keys(USER_TYPE_LABELS) as CustomerUserType[]).map((t) => (
              <option key={t} value={t}>{USER_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Organisation</label>
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value === '' ? '' : Number(e.target.value))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            disabled={submitting}
          >
            <option value="">— No organisation —</option>
            {organisations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Queue</label>
          <select
            value={queueId}
            onChange={(e) => setQueueId(e.target.value === '' ? '' : Number(e.target.value))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            disabled={submitting}
          >
            <option value="">— No queue —</option>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
        </div>
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
          {submitting ? 'Creating...' : 'Add User'}
        </button>
      </div>
    </form>
  );
};

// ── Edit Form ────────────────────────────────────────────────────────────────

interface EditFormProps {
  cu: CustomerUser;
  queues: Queue[];
  organisations: Organisation[];
  onSaved: (cu: CustomerUser) => void;
  onClose: () => void;
}

const EditForm: React.FC<EditFormProps> = ({ cu, queues, organisations, onSaved, onClose }) => {
  const [queueId, setQueueId] = useState<number | ''>(cu.queue ?? '');
  const [orgId, setOrgId] = useState<number | ''>(cu.organisation ?? '');
  const [userType, setUserType] = useState<CustomerUserType>(cu.user_type);
  const [isActive, setIsActive] = useState(cu.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await CsmAPI.updateCustomerUser(cu.id, {
        queue: queueId === '' ? null : queueId,
        organisation: orgId === '' ? null : orgId,
        user_type: userType,
        is_active: isActive,
      });
      onSaved(result);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 p-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">User</label>
        <p className="text-sm text-gray-500">{cu.user_name} ({cu.user_email})</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">User Type</label>
          <select
            value={userType}
            onChange={(e) => setUserType(e.target.value as CustomerUserType)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            disabled={saving}
          >
            {(Object.keys(USER_TYPE_LABELS) as CustomerUserType[]).map((t) => (
              <option key={t} value={t}>{USER_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Organisation</label>
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value === '' ? '' : Number(e.target.value))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            disabled={saving}
          >
            <option value="">— No organisation —</option>
            {organisations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Queue</label>
        <select
          value={queueId}
          onChange={(e) => setQueueId(e.target.value === '' ? '' : Number(e.target.value))}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          disabled={saving}
        >
          <option value="">— No queue —</option>
          {queues.map((q) => (
            <option key={q.id} value={q.id}>{q.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <input
          id="is_active"
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={saving}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────────

const CustomerUsersPageContent: React.FC = () => {
  const router = useRouter();
  const { activeProject } = useActiveProjectForFlatRoute();
  const projectId = Number(activeProject?.id ?? 0);
  const projectValid = projectId > 0;

  const [users, setUsers] = useState<CustomerUser[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<CustomerUser | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectValid) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [usersData, queuesData, orgRes] = await Promise.all([
        CsmAPI.getCustomerUsers(),
        CsmAPI.getQueues(),
        OrganisationAPI.list(),
      ]);
      setUsers(usersData);
      setQueues(queuesData);
      const orgData = orgRes.data;
      setOrganisations(Array.isArray(orgData) ? orgData : (orgData as any).results ?? []);
    } catch {
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [projectId, projectValid]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (cu: CustomerUser) => {
    if (!confirm(`Remove ${cu.user_name} from this project?`)) return;
    setDeletingId(cu.id);
    try {
      await CsmAPI.deleteCustomerUser(cu.id);
      setUsers((prev) => prev.filter((u) => u.id !== cu.id));
    } catch {
      alert('Failed to delete user assignment.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DashboardLayout alerts={[]} upcomingMeetings={[]}>
      <div className="p-8 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/select-project')}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CSM Users</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage support agents, supervisors, and their queue assignments.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add User
          </button>
        </div>

        {/* Content */}
        {!projectValid ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-center">
            <p className="text-sm text-gray-600">
              Open this page from a project card to manage CSM users.
            </p>
            <button onClick={() => router.push('/select-project')} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
              Go to projects
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
            <LoadingSpinner />
            <p className="text-sm text-gray-500">Loading users...</p>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={fetchData} className="px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded-lg hover:bg-red-100">
              Retry
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 border-2 border-dashed border-gray-200 rounded-xl">
            <Users className="h-8 w-8 text-gray-300" />
            <p className="text-gray-400 text-sm">No CSM users assigned yet.</p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50"
            >
              <Plus className="h-4 w-4" />
              Add your first user
            </button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Organisation</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Queue</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Team</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((cu) => (
                  <tr key={cu.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 font-medium text-gray-900">{cu.user_name}</td>
                    <td className="px-5 py-4 text-gray-500">{cu.user_email}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${USER_TYPE_COLORS[cu.user_type]}`}>
                        {USER_TYPE_LABELS[cu.user_type]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {cu.organisation_name ? (
                        <span className="px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full">
                          {cu.organisation_name}
                        </span>
                      ) : (
                        <span className="italic text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {cu.queue_name ? (
                        <span className="px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-full">
                          {cu.queue_name}
                        </span>
                      ) : (
                        <span className="italic text-gray-300 text-xs">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {cu.team_name ? (
                        <span className="px-2 py-0.5 text-xs font-medium bg-teal-50 text-teal-700 rounded-full">
                          {cu.team_name}
                        </span>
                      ) : (
                        <span className="italic text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${cu.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {cu.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingUser(cu)}
                          title="Edit"
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(cu)}
                          disabled={deletingId === cu.id}
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
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-xl">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Add CSM User</h2>
            <p className="text-sm text-gray-500 mt-0.5">Assign a user as an agent, supervisor, or admin.</p>
          </div>
          <CreateForm
            queues={queues}
            organisations={organisations}
            onSuccess={(cu) => { setUsers((prev) => [cu, ...prev]); setIsCreateOpen(false); }}
            onCancel={() => setIsCreateOpen(false)}
          />
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editingUser} onClose={() => setEditingUser(null)}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Edit CSM User</h2>
              <p className="text-sm text-gray-500 mt-0.5">Update role and queue assignment.</p>
            </div>
            <button onClick={() => setEditingUser(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md">
              <X className="h-4 w-4" />
            </button>
          </div>
          {editingUser && (
            <EditForm
              cu={editingUser}
              queues={queues}
              organisations={organisations}
              onSaved={(updated) => setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u))}
              onClose={() => setEditingUser(null)}
            />
          )}
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default function CustomerUsersPage() {
  return (
    <ProtectedRoute requiredAuth={true} requireAdmin={true}>
      <CustomerUsersPageContent />
    </ProtectedRoute>
  );
}
