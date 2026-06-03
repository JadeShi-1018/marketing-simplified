'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import CsmAPI from '@/lib/api/csmApi';
import {
  CustomerUser, CreateCustomerUserData, CustomerUserType,
  USER_TYPE_LABELS, USER_TYPE_COLORS, Queue,
} from '@/types/csm';
import { Plus, Pencil, Trash2, AlertCircle, Users } from 'lucide-react';

// ── Create Form ──────────────────────────────────────────────────────────────

interface CreateFormProps {
  queues: Queue[];
  organisationId: number;
  onSuccess: (cu: CustomerUser) => void;
  onCancel: () => void;
}

const CreateForm: React.FC<CreateFormProps> = ({ queues, organisationId, onSuccess, onCancel }) => {
  const [email, setEmail] = useState('');
  const [queueId, setQueueId] = useState<number | ''>('');
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
        organisation: organisationId,
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Email <span className="text-destructive">*</span></label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter user email" disabled={submitting} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">User Type</label>
          <select
            value={userType}
            onChange={(e) => setUserType(e.target.value as CustomerUserType)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            disabled={submitting}
          >
            {(Object.keys(USER_TYPE_LABELS) as CustomerUserType[]).map((t) => (
              <option key={t} value={t}>{USER_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Queue</label>
        <select
          value={queueId}
          onChange={(e) => setQueueId(e.target.value === '' ? '' : Number(e.target.value))}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          disabled={submitting}
        >
          <option value="">— No queue —</option>
          {queues.map((q) => (
            <option key={q.id} value={q.id}>{q.name}</option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Creating...' : 'Add User'}</Button>
      </div>
    </form>
  );
};

// ── Edit Form ────────────────────────────────────────────────────────────────

interface EditFormProps {
  cu: CustomerUser;
  queues: Queue[];
  onSaved: (cu: CustomerUser) => void;
  onClose: () => void;
}

const EditForm: React.FC<EditFormProps> = ({ cu, queues, onSaved, onClose }) => {
  const [queueId, setQueueId] = useState<number | ''>(cu.queue ?? '');
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
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">User</label>
        <p className="text-sm text-muted-foreground">{cu.user_name} ({cu.user_email})</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">User Type</label>
        <select
          value={userType}
          onChange={(e) => setUserType(e.target.value as CustomerUserType)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          disabled={saving}
        >
          {(Object.keys(USER_TYPE_LABELS) as CustomerUserType[]).map((t) => (
            <option key={t} value={t}>{USER_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Queue</label>
        <select
          value={queueId}
          onChange={(e) => setQueueId(e.target.value === '' ? '' : Number(e.target.value))}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          disabled={saving}
        >
          <option value="">— No queue —</option>
          {queues.map((q) => (
            <option key={q.id} value={q.id}>{q.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2.5">
        <input id="edit_is_active" type="checkbox" checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)} disabled={saving}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-ring" />
        <label htmlFor="edit_is_active" className="text-sm">Active</label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
};

// ── Users Tab ────────────────────────────────────────────────────────────────

interface UsersTabProps {
  projectId: number;
  organisationId: number;
}

const UsersTab: React.FC<UsersTabProps> = ({ organisationId }) => {
  const [users, setUsers] = useState<CustomerUser[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<CustomerUser | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, queuesData] = await Promise.all([
        CsmAPI.getCustomerUsers({ organisation: organisationId }),
        CsmAPI.getQueues({ organisation: organisationId }),
      ]);
      setUsers(usersData);
      setQueues(queuesData);
    } catch {
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [organisationId]);

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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">CSM Users</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage support agents, supervisors, and their queue assignments.</p>
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[240px] gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading users...</p>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[240px] gap-4 rounded-xl border-2 border-dashed border-gray-200">
          <Users className="h-10 w-10 text-gray-300" />
          <p className="text-muted-foreground text-sm">No CSM users assigned yet.</p>
          <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add your first user
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Name</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Email</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Type</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Queue</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Team</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((cu) => (
                <tr key={cu.id} className="transition hover:bg-gray-50/80">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{cu.user_name}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{cu.user_email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${USER_TYPE_COLORS[cu.user_type]}`}>
                      {USER_TYPE_LABELS[cu.user_type]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {cu.queue_name ? (
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-700/10">{cu.queue_name}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {cu.team_name ? (
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-700/10">{cu.team_name}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cu.is_active ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20' : 'bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-500/10'}`}>
                      {cu.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingUser(cu)} title="Edit">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(cu)} disabled={deletingId === cu.id} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add CSM User</DialogTitle>
            <DialogDescription>Assign a user as an agent, supervisor, or admin.</DialogDescription>
          </DialogHeader>
          <CreateForm
            queues={queues}
            organisationId={organisationId}
            onSuccess={(cu) => { setUsers((prev) => [cu, ...prev]); setIsCreateOpen(false); }}
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit CSM User</DialogTitle>
            <DialogDescription>Update role and queue assignment.</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <EditForm
              cu={editingUser}
              queues={queues}
              onSaved={(updated) => setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u))}
              onClose={() => setEditingUser(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersTab;
