'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { OrganisationAPI } from '@/lib/api/organisationAPI';
import { Organisation } from '@/types/organisation';
import { useAuthStore } from '@/lib/authStore';
import { Plus, Trash2, AlertCircle, Building2, ChevronDown, ChevronUp, Check, X, Pencil } from 'lucide-react';

// ── Inline Name Editor ──────────────────────────────────────────────────────

interface InlineNameEditorProps {
  orgId: number;
  currentName: string;
  onSaved: (updated: Organisation) => void;
  disabled?: boolean;
}

const InlineNameEditor: React.FC<InlineNameEditorProps> = ({ orgId, currentName, onSaved, disabled }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setName(currentName);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, currentName]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === currentName) { setEditing(false); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await OrganisationAPI.update(orgId, { name: trimmed });
      onSaved(res.data);
      setEditing(false);
    } catch (err: any) {
      setError(err?.response?.data?.name?.[0] || err?.response?.data?.detail || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') { setEditing(false); setError(null); }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5 group">
        <span className="font-medium text-gray-900">{currentName}</span>
        {!disabled && (
          <button
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100"
            title="Edit name"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className="h-8 text-sm"
        />
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleSave} disabled={saving || !name.trim()} title="Save">
          <Check className="h-4 w-4 text-primary" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setEditing(false); setError(null); }} disabled={saving} title="Cancel">
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};

// ── Organisations Tab ────────────────────────────────────────────────────────

interface OrganisationsTabProps {
  projectId: number | string;
}

const OrganisationsTab: React.FC<OrganisationsTabProps> = ({ projectId }) => {
  const user = useAuthStore((s) => s.user);
  const isCsmAdmin = user?.is_csm_admin ?? false;
  const canCreate = true;
  const canEdit = isCsmAdmin;
  const canDelete = isCsmAdmin;

  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedOrgId, setExpandedOrgId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create form state
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const orgRes = await OrganisationAPI.list();
      const orgData = orgRes.data;
      setOrgs(Array.isArray(orgData) ? orgData : (orgData as any).results ?? []);
    } catch {
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaved = (updated: Organisation) => {
    setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Delete organisation "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    setActionError(null);
    try {
      await OrganisationAPI.destroy(id);
      setOrgs((prev) => prev.filter((o) => o.id !== id));
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Could not delete this organisation.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = createName.trim();
    if (!trimmed) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await OrganisationAPI.create({ name: trimmed });
      setOrgs((prev) => [res.data, ...prev]);
      setCreateName('');
      setIsCreateOpen(false);
    } catch (err: any) {
      setCreateError(err?.response?.data?.name?.[0] || err?.response?.data?.detail || 'Failed to create organisation.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Organisations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage B2B organisations and their associated customers.</p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Organisation
          </Button>
        )}
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[240px] gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading organisations...</p>
        </div>
      ) : orgs.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[240px] gap-4 rounded-xl border-2 border-dashed border-gray-200">
          <Building2 className="h-10 w-10 text-gray-300" />
          <div className="text-center">
            <p className="text-gray-900 font-medium">Get started</p>
            <p className="text-muted-foreground text-sm mt-1">Create your first organisation to start managing customers.</p>
          </div>
          {canCreate && (
            <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Create Organisation
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Name</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Customers</th>
                {canDelete && (
                  <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-gray-500">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map((org) => (
                <React.Fragment key={org.id}>
                  <tr className="transition hover:bg-gray-50/80">
                    <td className="px-5 py-3.5">
                      <InlineNameEditor
                        orgId={org.id}
                        currentName={org.name}
                        onSaved={handleSaved}
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => setExpandedOrgId(expandedOrgId === org.id ? null : org.id)}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80"
                      >
                        {org.customers?.length ?? 0}
                        {expandedOrgId === org.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    </td>
                    {canDelete && (
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(org.id, org.name)} disabled={deletingId === org.id} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {expandedOrgId === org.id && (
                    <tr>
                      <td colSpan={canDelete ? 3 : 2} className="px-5 py-3 bg-gray-50/60">
                        {org.customers && org.customers.length > 0 ? (
                          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/60">
                                  <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Name</th>
                                  <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Email</th>
                                  <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Company</th>
                                  <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {org.customers.map((c) => (
                                  <tr key={c.id} className="transition hover:bg-gray-50/80">
                                    <td className="px-4 py-2 text-gray-900">{c.full_name}</td>
                                    <td className="px-4 py-2 text-muted-foreground">{c.email}</td>
                                    <td className="px-4 py-2 text-muted-foreground">{c.company || '—'}</td>
                                    <td className="px-4 py-2">
                                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${c.is_active ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20' : 'bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-500/10'}`}>
                                        {c.is_active ? 'Active' : 'Inactive'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground italic py-2">No customers associated with this organisation.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Dialog — name only */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) { setCreateName(''); setCreateError(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Organisation</DialogTitle>
            <DialogDescription>Enter a name for the new organisation.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            {createError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{createError}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
              <Input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Acme Corp"
                disabled={creating}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateOpen(false)} disabled={creating}>Cancel</Button>
              <Button type="submit" size="sm" disabled={creating || !createName.trim()}>
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganisationsTab;
