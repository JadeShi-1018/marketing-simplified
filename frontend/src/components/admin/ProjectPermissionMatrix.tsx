'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { PermissionAPI } from '@/lib/api/permissionApi';
import { Permission, ProjectPermissionMatrix as ProjectPermissionMatrixType } from '@/types/permission';

interface ProjectPermissionMatrixProps {
  projectId?: string | number | null;
}

const getPermissionKey = (permission: Permission) => permission.id;

const ProjectPermissionMatrix: React.FC<ProjectPermissionMatrixProps> = ({ projectId }) => {
  const [data, setData] = useState<ProjectPermissionMatrixType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMatrix = async () => {
    if (!projectId) {
      setData(null);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await PermissionAPI.getProjectPermissionMatrix(String(projectId));
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permission matrix');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    data?.permissions.forEach((permission) => {
      if (!groups[permission.module]) {
        groups[permission.module] = [];
      }
      groups[permission.module].push(permission);
    });
    return groups;
  }, [data?.permissions]);

  if (!projectId) {
    return (
      <section className="mb-8 border border-amber-200 bg-amber-50 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-amber-900">Effective Permissions Matrix</h2>
            <p className="text-sm text-amber-800 mt-1">
              Select or activate a project to view the role permission matrix.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8 border border-gray-200 bg-white rounded-lg overflow-hidden" data-testid="project-permission-matrix">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-[#1a9ba3]" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Effective Permissions Matrix</h2>
            <p className="text-sm text-gray-600">
              {data ? `Project: ${data.projectName}` : 'Current project role and permission coverage'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadMatrix}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="m-5 border border-red-200 bg-red-50 p-4 rounded-md text-sm text-red-800">
          {error}
        </div>
      )}

      {data?.warnings && data.warnings.length > 0 && (
        <div className="m-5 space-y-2" data-testid="permission-matrix-warnings">
          {data.warnings.map((warning, index) => (
            <div key={`${warning.code}-${index}`} className="flex items-start gap-2 border border-amber-200 bg-amber-50 p-3 rounded-md">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">{warning.code}</p>
                <p className="text-sm text-amber-800">{warning.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center gap-2 p-5 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading permission matrix...
        </div>
      ) : data && (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-700 border-b border-r border-gray-200 min-w-44">
                  Role
                </th>
                {Object.entries(groupedPermissions).map(([module, permissions]) => (
                  <th key={module} colSpan={permissions.length} className="px-4 py-2 text-center font-semibold text-gray-700 border-b border-r border-gray-200">
                    {module}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-left font-medium text-gray-500 border-b border-r border-gray-200">
                  Level
                </th>
                {Object.values(groupedPermissions).flat().map((permission) => (
                  <th key={permission.id} className="px-3 py-2 text-center font-medium text-gray-500 border-b border-r border-gray-200 min-w-24">
                    {permission.action}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.roles.map((role) => (
                <tr key={role.id} className="hover:bg-gray-50">
                  <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left border-b border-r border-gray-200">
                    <div className="font-medium text-gray-900">{role.name}</div>
                    <div className="text-xs text-gray-500">Level {role.rank}</div>
                  </th>
                  {Object.values(groupedPermissions).flat().map((permission) => {
                    const granted = data.matrix[role.id]?.[getPermissionKey(permission)] || false;
                    return (
                      <td key={`${role.id}-${permission.id}`} className="px-3 py-3 text-center border-b border-r border-gray-100">
                        {granted ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700" aria-label="Granted">
                            <Check className="h-4 w-4" />
                          </span>
                        ) : (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-400" aria-label="Not granted">
                            <X className="h-4 w-4" />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default ProjectPermissionMatrix;
