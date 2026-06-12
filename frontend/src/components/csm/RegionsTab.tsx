'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { RegionAPI } from '@/lib/api/regionAPI';
import { Region } from '@/types/region';
import { Plus, Pencil, Trash2, AlertCircle, Globe } from 'lucide-react';

// ── Create Form ──────────────────────────────────────────────────────────────

interface CreateFormProps {
  organisationId: number;
  onSuccess: (region: Region) => void;
  onCancel: () => void;
}

const CreateForm: React.FC<CreateFormProps> = ({ organisationId, onSuccess, onCancel }) => {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setNameError('Region name is required.'); return; }
    setNameError(null);
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await RegionAPI.create({ name: name.trim(), organisation: organisationId });
      onSuccess(res.data);
    } catch (err: any) {
      setServerError(err?.response?.data?.name?.[0] || err?.response?.data?.detail || 'Failed to create region.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {serverError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {serverError}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Region Name <span className="text-destructive">*</span></label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Asia Pacific" disabled={submitting} />
        {nameError && <p className="text-xs text-destructive">{nameError}</p>}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Creating...' : 'Create Region'}</Button>
      </div>
    </form>
  );
};

// ── Edit Form ────────────────────────────────────────────────────────────────

interface EditFormProps {
  regionId: number;
  onSaved: (region: Region) => void;
  onClose: () => void;
}

const EditForm: React.FC<EditFormProps> = ({ regionId, onSaved, onClose }) => {
  const [region, setRegion] = useState<Region | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchRegion = useCallback(async () => {
    setLoading(true); setFetchError(null);
    try { const res = await RegionAPI.retrieve(regionId); setRegion(res.data); setName(res.data.name); setIsActive(res.data.is_active); }
    catch { setFetchError('Failed to load region details.'); }
    finally { setLoading(false); }
  }, [regionId]);

  useEffect(() => { fetchRegion(); }, [fetchRegion]);

  const isDirty = region !== null && (name !== region.name || isActive !== region.is_active);

  const handleSave = async () => {
    setSaving(true); setSaveError(null);
    try { const res = await RegionAPI.update(regionId, { name: name.trim(), is_active: isActive }); setRegion(res.data); onSaved(res.data); onClose(); }
    catch (err: any) { setSaveError(err?.response?.data?.name?.[0] || err?.response?.data?.detail || 'Failed to save changes.'); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-40 gap-3">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-primary" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );

  if (fetchError || !region) return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{fetchError || 'Region not found.'}</span>
      <Button variant="outline" size="sm" onClick={fetchRegion}>Retry</Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {saveError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Region Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
      </div>
      <div className="flex items-center gap-2.5">
        <input id="region_active" type="checkbox" checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)} disabled={saving}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-ring" />
        <label htmlFor="region_active" className="text-sm">Active</label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!isDirty || saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
};

// ── Regions Tab ──────────────────────────────────────────────────────────────

interface RegionsTabProps {
  projectId: number | string;
  organisationId: number;
}

const RegionsTab: React.FC<RegionsTabProps> = ({ organisationId }) => {
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRegionId, setEditingRegionId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await RegionAPI.list({ organisation: organisationId });
      const data = res.data;
      setRegions(Array.isArray(data) ? data : (data as any).results ?? []);
    } catch { setError('Failed to load regions.'); }
    finally { setLoading(false); }
  }, [organisationId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreated = (region: Region) => { setRegions((prev) => [region, ...prev]); setIsCreateOpen(false); };
  const handleSaved = (updated: Region) => { setRegions((prev) => prev.map((r) => (r.id === updated.id ? updated : r))); setEditingRegionId(null); };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Delete region "${name}"? This cannot be undone.`)) return;
    setDeletingId(id); setActionError(null);
    try { await RegionAPI.destroy(id); setRegions((prev) => prev.filter((r) => r.id !== id)); }
    catch (err: any) { setActionError(err?.response?.data?.detail || 'Could not delete this region.'); }
    finally { setDeletingId(null); }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Regions</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage region options for customers and organisations.</p>
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Region
        </Button>
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
          <p className="text-sm text-muted-foreground">Loading regions...</p>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
        </div>
      ) : regions.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[240px] gap-4 rounded-xl border-2 border-dashed border-gray-200">
          <Globe className="h-10 w-10 text-gray-300" />
          <p className="text-muted-foreground text-sm">No regions found.</p>
          <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add your first region
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Name</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {regions.map((region) => (
                <tr key={region.id} className="transition hover:bg-gray-50/80">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{region.name}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${region.is_active ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20' : 'bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-500/10'}`}>
                      {region.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingRegionId(region.id)} title="Edit">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(region.id, region.name)} disabled={deletingId === region.id} title="Delete">
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
            <DialogTitle>Add Region</DialogTitle>
            <DialogDescription>Create a new region option.</DialogDescription>
          </DialogHeader>
          <CreateForm organisationId={organisationId} onSuccess={handleCreated} onCancel={() => setIsCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editingRegionId !== null} onOpenChange={(open) => { if (!open) setEditingRegionId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Region</DialogTitle>
            <DialogDescription>Update region name or status.</DialogDescription>
          </DialogHeader>
          {editingRegionId !== null && (
            <EditForm regionId={editingRegionId} onSaved={handleSaved} onClose={() => setEditingRegionId(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RegionsTab;
