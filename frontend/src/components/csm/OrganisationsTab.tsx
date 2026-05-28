'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { OrganisationAPI } from '@/lib/api/organisationAPI';
import { RegionAPI } from '@/lib/api/regionAPI';
import { Organisation } from '@/types/organisation';
import { Region } from '@/types/region';
import { useAuthStore } from '@/lib/authStore';
import { Plus, Pencil, Trash2, AlertCircle, Building2, ChevronDown, ChevronUp, X } from 'lucide-react';

// ── Region Select ────────────────────────────────────────────────────────────

interface RegionSelectProps {
  value: number | null;
  onChange: (id: number | null) => void;
  regions: Region[];
  disabled?: boolean;
}

const RegionSelect: React.FC<RegionSelectProps> = ({ value, onChange, regions, disabled }) => (
  <select
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    disabled={disabled}
    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
  >
    <option value="">— No region —</option>
    {regions.filter((r) => r.is_active).map((r) => (
      <option key={r.id} value={r.id}>{r.name}</option>
    ))}
  </select>
);

// ── Domain Tags Input ────────────────────────────────────────────────────────

interface DomainInputProps {
  domains: string[];
  onChange: (domains: string[]) => void;
  disabled?: boolean;
}

const DomainInput: React.FC<DomainInputProps> = ({ domains, onChange, disabled }) => {
  const [input, setInput] = useState('');

  const addDomain = () => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed && !domains.includes(trimmed)) onChange([...domains, trimmed]);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addDomain(); }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input type="text" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown} placeholder="e.g. example.com"
          disabled={disabled} />
        <Button type="button" variant="outline" size="sm" onClick={addDomain} disabled={disabled || !input.trim()}>
          Add
        </Button>
      </div>
      {domains.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {domains.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-500/10">
              {d}
              <button type="button" onClick={() => onChange(domains.filter((x) => x !== d))} disabled={disabled} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Create Form ──────────────────────────────────────────────────────────────

interface CreateFormProps {
  regions: Region[];
  onSuccess: (org: Organisation) => void;
  onCancel: () => void;
}

const CreateForm: React.FC<CreateFormProps> = ({ regions, onSuccess, onCancel }) => {
  const [form, setForm] = useState({ name: '', domains: [] as string[], industry: '', plan: '', region: null as number | null });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const validate = () => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Organisation name is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await OrganisationAPI.create({ ...form, name: form.name.trim() });
      onSuccess(res.data);
    } catch (err: any) {
      setServerError(err?.response?.data?.name?.[0] || err?.response?.data?.detail || 'Failed to create organisation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {serverError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />{serverError}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
        <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Acme Corp" disabled={submitting} />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Domains</label>
        <DomainInput domains={form.domains} onChange={(domains) => setForm({ ...form, domains })} disabled={submitting} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Industry</label>
          <Input type="text" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}
            placeholder="e.g. Technology" disabled={submitting} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Plan</label>
          <Input type="text" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}
            placeholder="e.g. Enterprise" disabled={submitting} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Region</label>
        <RegionSelect value={form.region} onChange={(id) => setForm({ ...form, region: id })} regions={regions} disabled={submitting} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Organisation'}
        </Button>
      </div>
    </form>
  );
};

// ── Edit Form ────────────────────────────────────────────────────────────────

interface EditFormProps {
  orgId: number;
  regions: Region[];
  onSaved: (org: Organisation) => void;
  onClose: () => void;
}

const EditForm: React.FC<EditFormProps> = ({ orgId, regions, onSaved, onClose }) => {
  const [org, setOrg] = useState<Organisation | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [industry, setIndustry] = useState('');
  const [plan, setPlan] = useState('');
  const [region, setRegion] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchOrg = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await OrganisationAPI.retrieve(orgId);
      setOrg(res.data);
      setName(res.data.name);
      setDomains(res.data.domains ?? []);
      setIndustry(res.data.industry ?? '');
      setPlan(res.data.plan ?? '');
      setRegion(res.data.region);
    } catch {
      setFetchError('Failed to load organisation details.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchOrg(); }, [fetchOrg]);

  const isDirty = org !== null && (
    name !== org.name ||
    JSON.stringify(domains) !== JSON.stringify(org.domains ?? []) ||
    industry !== (org.industry ?? '') ||
    plan !== (org.plan ?? '') ||
    region !== org.region
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await OrganisationAPI.update(orgId, { name: name.trim(), domains, industry, plan, region });
      setOrg(res.data);
      onSaved(res.data);
      onClose();
    } catch (err: any) {
      setSaveError(err?.response?.data?.name?.[0] || err?.response?.data?.detail || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-40 gap-3">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-primary" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );

  if (fetchError || !org) return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{fetchError || 'Organisation not found.'}</span>
      <Button variant="outline" size="sm" onClick={fetchOrg}>Retry</Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {saveError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />{saveError}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Name</label>
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Domains</label>
        <DomainInput domains={domains} onChange={setDomains} disabled={saving} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Industry</label>
          <Input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} disabled={saving} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Plan</label>
          <Input type="text" value={plan} onChange={(e) => setPlan(e.target.value)} disabled={saving} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Region</label>
        <RegionSelect value={region} onChange={setRegion} regions={regions} disabled={saving} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!isDirty || saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
};

// ── Organisations Tab ────────────────────────────────────────────────────────

interface OrganisationsTabProps {
  projectId: number;
}

const OrganisationsTab: React.FC<OrganisationsTabProps> = ({ projectId }) => {
  const user = useAuthStore((s) => s.user);
  const isCsmAdmin = user?.is_csm_admin ?? false;
  const canCreate = true;
  const canEdit = isCsmAdmin;
  const canDelete = isCsmAdmin;

  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [expandedOrgId, setExpandedOrgId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [orgRes, regRes] = await Promise.allSettled([
        OrganisationAPI.list(),
        RegionAPI.list(),
      ]);
      if (orgRes.status === 'fulfilled') {
        const orgData = orgRes.value.data;
        setOrgs(Array.isArray(orgData) ? orgData : (orgData as any).results ?? []);
      } else {
        setOrgs([]);
      }
      if (regRes.status === 'fulfilled') {
        const regData = regRes.value.data;
        setRegions(Array.isArray(regData) ? regData : (regData as any).results ?? []);
      } else {
        setRegions([]);
      }
    } catch {
      setOrgs([]);
      setRegions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreated = (org: Organisation) => { setOrgs((prev) => [org, ...prev]); setIsCreateOpen(false); };
  const handleSaved = (updated: Organisation) => { setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o))); setEditingOrgId(null); };

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

  const getRegionName = (regionId: number | null) => {
    if (!regionId) return null;
    return regions.find((r) => r.id === regionId)?.name ?? null;
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
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Industry</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Plan</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Region</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Customers</th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map((org) => (
                <React.Fragment key={org.id}>
                  <tr className="transition hover:bg-gray-50/80">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-gray-900">{org.name}</div>
                      {org.domains && org.domains.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {org.domains.map((d) => (
                            <span key={d} className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-500/10">{d}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{org.industry || <span className="text-xs italic">—</span>}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{org.plan || <span className="text-xs italic">—</span>}</td>
                    <td className="px-5 py-3.5">
                      {getRegionName(org.region) ? (
                        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-700/10">{getRegionName(org.region)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
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
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingOrgId(org.id)} title="Edit">
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(org.id, org.name)} disabled={deletingId === org.id} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedOrgId === org.id && (
                    <tr>
                      <td colSpan={6} className="px-5 py-3 bg-gray-50/60">
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

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Organisation</DialogTitle>
            <DialogDescription>Create a new B2B organisation record.</DialogDescription>
          </DialogHeader>
          <CreateForm regions={regions} onSuccess={handleCreated} onCancel={() => setIsCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editingOrgId !== null} onOpenChange={(open) => { if (!open) setEditingOrgId(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Organisation</DialogTitle>
            <DialogDescription>Update organisation details.</DialogDescription>
          </DialogHeader>
          {editingOrgId !== null && (
            <EditForm orgId={editingOrgId} regions={regions} onSaved={handleSaved} onClose={() => setEditingOrgId(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganisationsTab;
