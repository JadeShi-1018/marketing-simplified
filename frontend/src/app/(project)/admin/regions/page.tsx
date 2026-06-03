'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import { RegionAPI } from '@/lib/api/regionAPI';
import { Region, CreateRegionData, UpdateRegionData } from '@/types/region';
import { Plus, Pencil, Trash2, AlertCircle, X, Globe, ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

// ── Create Form ───────────────────────────────────────────────────────────────

interface CreateFormProps {
  projectId: number;
  onSuccess: (region: Region) => void;
  onCancel: () => void;
}

const CreateForm: React.FC<CreateFormProps> = ({ projectId, onSuccess, onCancel }) => {
  // ---- state ----
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // ---- validation ----
  const validate = () => {
    if (!name.trim()) {
      setNameError('Region name is required.');
      return false;
    }
    setNameError(null);
    return true;
  };

  // ---- submit ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const res = await RegionAPI.create({ name: name.trim() });
      onSuccess(res.data);
    } catch (err: any) {
      const detail =
        err?.response?.data?.name?.[0] ||
        err?.response?.data?.detail ||
        'Failed to create region.';
      setServerError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- render ----
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
          Region Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Asia Pacific"
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={submitting}
        />
        {nameError && <p className="text-xs text-red-600">{nameError}</p>}
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
          {submitting ? 'Creating...' : 'Create Region'}
        </button>
      </div>
    </form>
  );
};
// ── Edit Form ─────────────────────────────────────────────────────────────────

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
    setLoading(true);
    setFetchError(null);
    try {
      const res = await RegionAPI.retrieve(regionId);
      setRegion(res.data);
      setName(res.data.name);
      setIsActive(res.data.is_active);
    } catch {
      setFetchError('Failed to load region details.');
    } finally {
      setLoading(false);
    }
  }, [regionId]);

  useEffect(() => {
    fetchRegion();
  }, [fetchRegion]);

  const isDirty = region !== null && (name !== region.name || isActive !== region.is_active);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await RegionAPI.update(regionId, { name: name.trim(), is_active: isActive });
      setRegion(res.data);
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

  if (fetchError || !region) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{fetchError || 'Region not found.'}</p>
          <button onClick={fetchRegion} className="px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded-lg hover:bg-red-100">
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
        <label className="text-sm font-medium text-gray-700">Region Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={saving}
        />
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
          onClick={handleClose}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

const RegionsPage: React.FC = () => {  
    const router = useRouter();                                                                                                       
    const searchParams = useSearchParams();                                                                                         
    const projectId = Number(searchParams.get('project'));                                                                            
    const projectValid = Number.isFinite(projectId) && projectId > 0;                                                                 
                                                                                                                                      
    const [regions, setRegions] = useState<Region[]>([]);                                                                             
    const [loading, setLoading] = useState(true);                                                                                     
    const [error, setError] = useState<string | null>(null);                                                                        
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingRegionId, setEditingRegionId] = useState<number | null>(null);

    const fetchData = useCallback(async () => {                                                                                       
        if (!projectValid) {                                                                                                            
          setLoading(false);               
          return;                                                                                                                       
        }                                                                                                                             
        setLoading(true);                                                                                                               
        setError(null);
        try {                                                                                                                           
          const res = await RegionAPI.list();                                                                   
          const data = res.data;                                                                                                        
          setRegions(Array.isArray(data) ? data : (data as any).results ?? []);
        } catch {                                                                                                                       
          setError('Failed to load regions.');                                                                                        
        } finally {                                                                                                                     
          setLoading(false);                                                                                                          
        }                                  
      }, [projectId, projectValid]);
                                                                                                                                        
      useEffect(() => {
        fetchData();
      }, [fetchData]);

  // ---- event handling ----

  // create success: add new region to the list, close modal
  const handleCreated = (region: Region) => {
    setRegions((prev) => [region, ...prev]);
    setIsCreateModalOpen(false);
  };

  // edit success: update the corresponding region in the list
  const handleSaved = (updated: Region) => {
    setRegions((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setEditingRegionId(null);
  };

  // delete: call API, remove from list after success
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Delete region "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    setActionError(null);
    try {
      await RegionAPI.destroy(id);
      setRegions((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Could not delete this region.');
    } finally {
      setDeletingId(null);
    }
  };

  // ---- render ----
  return (
    <ProtectedRoute requiredAuth={true} requireAdmin={true} fallback="/unauthorized">
      <DashboardLayout alerts={[]} upcomingMeetings={[]}>
        <div className="p-8 flex flex-col gap-6">

          {/* page title + add button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/select-project')}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Regions</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Manage region options for customers and organisations.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Region
            </button>
          </div>

          {/* action error message */}
          {actionError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {actionError}
              <button onClick={() => setActionError(null)} className="ml-auto text-xs underline text-red-500 hover:text-red-700">
                Dismiss
              </button>
            </div>
          )}

          {/* content area: show different content based on state */}
          {!projectValid ? (
            // no project parameter
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-center">
              <p className="text-sm text-gray-600">
                Open this page from a project card to manage regions for that project.
              </p>
              <button
                onClick={() => router.push('/select-project')}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
              >
                Go to projects
              </button>
            </div>
          ) : loading ? (
            // loading
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
              <LoadingSpinner />
              <p className="text-sm text-gray-500">Loading regions...</p>
            </div>
          ) : error ? (
            // loading error
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              <p className="text-sm text-red-700 flex-1">{error}</p>
              <button onClick={fetchData} className="px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded-lg hover:bg-red-100">
                Retry
              </button>
            </div>
          ) : regions.length === 0 ? (
            // empty list
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 border-2 border-dashed border-gray-200 rounded-xl">
              <Globe className="h-8 w-8 text-gray-300" />
              <p className="text-gray-400 text-sm">No regions found.</p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50"
              >
                <Plus className="h-4 w-4" />
                Add your first region
              </button>
            </div>
          ) : (
            // Region 列表表格
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {regions.map((region) => (
                    <tr key={region.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 font-medium text-gray-900">{region.name}</td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${region.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {region.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingRegionId(region.id)}
                            title="Edit"
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(region.id, region.name)}
                            disabled={deletingId === region.id}
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

        {/* create */}
        <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Add Region</h2>
              <p className="text-sm text-gray-500 mt-0.5">Create a new region option.</p>
            </div>
            <CreateForm
              projectId={projectId}
              onSuccess={handleCreated}
              onCancel={() => setIsCreateModalOpen(false)}
            />
          </div>
        </Modal>
        {/* edit */}
        <Modal isOpen={editingRegionId !== null} onClose={() => setEditingRegionId(null)} disableBackdropClose={true}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Edit Region</h2>
                <p className="text-sm text-gray-500 mt-0.5">Update region name or status.</p>
              </div>
              <button onClick={() => setEditingRegionId(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md">
                <X className="h-4 w-4" />
              </button>
            </div>
            {editingRegionId !== null && (
              <EditForm
                regionId={editingRegionId}
                onSaved={handleSaved}
                onClose={() => setEditingRegionId(null)}
              />
            )}
          </div>
        </Modal>
      </DashboardLayout>
    </ProtectedRoute>
  );
};

export default RegionsPage;