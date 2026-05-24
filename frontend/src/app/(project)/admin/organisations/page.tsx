'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import { OrganisationAPI } from '@/lib/api/organisationAPI';
import { RegionAPI } from '@/lib/api/regionAPI';
import { Organisation, CreateOrganisationData, UpdateOrganisationData } from '@/types/organisation';
import { Region } from '@/types/region';
import { Plus, Pencil, Trash2, AlertCircle, X, Building2, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

// ── Region Select (shared) ───────────────────────────────────────────────────

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
    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
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
    if (trimmed && !domains.includes(trimmed)) {
      onChange([...domains, trimmed]);
    }
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDomain();
    }
  };

  const removeDomain = (domain: string) => {
    onChange(domains.filter((d) => d !== domain));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. example.com"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={addDomain}
          disabled={disabled || !input.trim()}
          className="px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {domains.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {domains.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
              {d}
              <button type="button" onClick={() => removeDomain(d)} disabled={disabled} className="hover:text-red-500">
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
  projectId: number;
  regions: Region[];
  onSuccess: (org: Organisation) => void;
  onCancel: () => void;
}

const CreateForm: React.FC<CreateFormProps> = ({ projectId, regions, onSuccess, onCancel }) => {
  const [form, setForm] = useState<CreateOrganisationData>({
    name: '',
    domains: [],
    industry: '',
    plan: '',
    region: null,
  });
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
      const res = await OrganisationAPI.create({ ...form, name: form.name.trim() }, projectId);
      onSuccess(res.data);
    } catch (err: any) {
      const detail =
        err?.response?.data?.name?.[0] ||
        err?.response?.data?.detail ||
        'Failed to create organisation.';
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
          placeholder="Acme Corp"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={submitting}
        />
        {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Domains</label>
        <DomainInput
          domains={form.domains ?? []}
          onChange={(domains) => setForm({ ...form, domains })}
          disabled={submitting}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Industry</label>
          <input
            type="text"
            value={form.industry ?? ''}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
            placeholder="e.g. Technology"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={submitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Plan</label>
          <input
            type="text"
            value={form.plan ?? ''}
            onChange={(e) => setForm({ ...form, plan: e.target.value })}
            placeholder="e.g. Enterprise"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={submitting}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Region</label>
        <RegionSelect
          value={form.region ?? null}
          onChange={(id) => setForm({ ...form, region: id })}
          regions={regions}
          disabled={submitting}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
        <button type="button" onClick={onCancel} disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {submitting ? 'Creating...' : 'Create Organisation'}
        </button>
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

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

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
      const res = await OrganisationAPI.update(orgId, {
        name: name.trim(),
        domains,
        industry,
        plan,
        region,
      });
      setOrg(res.data);
      onSaved(res.data);
      onClose();
    } catch (err: any) {
      const detail =
        err?.response?.data?.name?.[0] ||
        err?.response?.data?.detail ||
        'Failed to save changes.';
      setSaveError(detail);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Close anyway?')) return;
    onClose();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <LoadingSpinner />
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (fetchError || !org) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{fetchError || 'Organisation not found.'}</p>
          <button onClick={fetchOrg} className="px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded-lg hover:bg-red-100">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      {saveError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={saving} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Domains</label>
        <DomainInput domains={domains} onChange={setDomains} disabled={saving} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Industry</label>
          <input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={saving} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Plan</label>
          <input type="text" value={plan} onChange={(e) => setPlan(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={saving} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Region</label>
        <RegionSelect value={region} onChange={setRegion} regions={regions} disabled={saving} />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button onClick={handleClose} disabled={saving}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          Cancel
        </button>
        <button onClick={handleSave} disabled={!isDirty || saving}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────────

const OrganisationsPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = Number(searchParams.get('project'));
  const projectValid = Number.isFinite(projectId) && projectId > 0;

  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [expandedOrgId, setExpandedOrgId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectValid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [orgRes, regRes] = await Promise.all([
        OrganisationAPI.list({ project: projectId }),
        RegionAPI.list({ project: projectId }),
      ]);
      const orgData = orgRes.data;
      setOrgs(Array.isArray(orgData) ? orgData : (orgData as any).results ?? []);
      const regData = regRes.data;
      setRegions(Array.isArray(regData) ? regData : (regData as any).results ?? []);
    } catch {
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [projectId, projectValid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreated = (org: Organisation) => {
    setOrgs((prev) => [org, ...prev]);
    setIsCreateModalOpen(false);
  };

  const handleSaved = (updated: Organisation) => {
    setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    setEditingOrgId(null);
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

  const getRegionName = (regionId: number | null) => {
    if (!regionId) return null;
    return regions.find((r) => r.id === regionId)?.name ?? null;
  };

  return (
    <ProtectedRoute requiredAuth={true} fallback="/unauthorized">
      <DashboardLayout alerts={[]} upcomingMeetings={[]}>
        <div className="p-8 flex flex-col gap-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/select-project')}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Organisations</h1>
                <p className="mt-1 text-sm text-gray-500">Manage B2B organisations and their associated customers.</p>
              </div>
            </div>
            <button onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus className="h-4 w-4" />
              Add Organisation
            </button>
          </div>

          {/* Action error */}
          {actionError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {actionError}
              <button onClick={() => setActionError(null)} className="ml-auto text-xs underline text-red-500 hover:text-red-700">Dismiss</button>
            </div>
          )}

          {/* Content */}
          {!projectValid ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-center">
              <p className="text-sm text-gray-600">Open this page from a project card to manage organisations.</p>
              <button onClick={() => router.push('/select-project')}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
                Go to projects
              </button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
              <LoadingSpinner />
              <p className="text-sm text-gray-500">Loading organisations...</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              <p className="text-sm text-red-700 flex-1">{error}</p>
              <button onClick={fetchData} className="px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded-lg hover:bg-red-100">Retry</button>
            </div>
          ) : orgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 border-2 border-dashed border-gray-200 rounded-xl">
              <Building2 className="h-8 w-8 text-gray-300" />
              <p className="text-gray-400 text-sm">No organisations found.</p>
              <button onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50">
                <Plus className="h-4 w-4" />
                Add your first organisation
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Industry</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Plan</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Region</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Customers</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orgs.map((org) => (
                    <React.Fragment key={org.id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-medium text-gray-900">{org.name}</div>
                          {org.domains && org.domains.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {org.domains.map((d) => (
                                <span key={d} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">{d}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-gray-500">{org.industry || <span className="italic text-gray-300">—</span>}</td>
                        <td className="px-5 py-4 text-gray-500">{org.plan || <span className="italic text-gray-300">—</span>}</td>
                        <td className="px-5 py-4">
                          {getRegionName(org.region) ? (
                            <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
                              {getRegionName(org.region)}
                            </span>
                          ) : (
                            <span className="italic text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <button
                            onClick={() => setExpandedOrgId(expandedOrgId === org.id ? null : org.id)}
                            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                          >
                            {org.customers?.length ?? 0}
                            {expandedOrgId === org.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setEditingOrgId(org.id)} title="Edit"
                              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleDelete(org.id, org.name)} disabled={deletingId === org.id} title="Delete"
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-40">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Expanded customer list (AC2) */}
                      {expandedOrgId === org.id && (
                        <tr>
                          <td colSpan={6} className="px-5 py-3 bg-gray-50">
                            {org.customers && org.customers.length > 0 ? (
                              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Email</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Company</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {org.customers.map((c) => (
                                      <tr key={c.id}>
                                        <td className="px-4 py-2 text-gray-900">{c.full_name}</td>
                                        <td className="px-4 py-2 text-gray-500">{c.email}</td>
                                        <td className="px-4 py-2 text-gray-500">{c.company || '—'}</td>
                                        <td className="px-4 py-2">
                                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {c.is_active ? 'Active' : 'Inactive'}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400 italic py-2">No customers associated with this organisation.</p>
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
        </div>

        {/* Create Modal */}
        <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Add Organisation</h2>
              <p className="text-sm text-gray-500 mt-0.5">Create a new B2B organisation record.</p>
            </div>
            <CreateForm projectId={projectId} regions={regions} onSuccess={handleCreated} onCancel={() => setIsCreateModalOpen(false)} />
          </div>
        </Modal>

        {/* Edit Modal */}
        <Modal isOpen={editingOrgId !== null} onClose={() => setEditingOrgId(null)} disableBackdropClose={true}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Edit Organisation</h2>
                <p className="text-sm text-gray-500 mt-0.5">Update organisation details.</p>
              </div>
              <button onClick={() => setEditingOrgId(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md">
                <X className="h-4 w-4" />
              </button>
            </div>
            {editingOrgId !== null && (
              <EditForm orgId={editingOrgId} regions={regions} onSaved={handleSaved} onClose={() => setEditingOrgId(null)} />
            )}
          </div>
        </Modal>
      </DashboardLayout>
    </ProtectedRoute>
  );
};

export default OrganisationsPage;
