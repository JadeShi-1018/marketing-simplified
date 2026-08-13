'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { RetentionPolicyAPI } from '@/lib/api/retentionPolicyAPI';
import { RetentionPolicy } from '@/types/retentionPolicy';
import { AlertCircle, ShieldCheck } from 'lucide-react';

const DataRetentionPage: React.FC = () => {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await RetentionPolicyAPI.list();
      setPolicies(res.data);
    } catch {
      setError('Failed to load retention policies.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <ProtectedRoute requiredAuth={true} requireAdmin={true} fallback="/unauthorized">
      <DashboardLayout alerts={[]} upcomingMeetings={[]}>
        <div className="p-8 flex flex-col gap-6">

          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Retention</h1>
            <p className="mt-1 text-sm text-gray-500">
              Registered data-retention policies and their configured windows. Read-only —
              windows are set via environment configuration, not from this page.
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
              <LoadingSpinner />
              <p className="text-sm text-gray-500">Loading retention policies...</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              <p className="text-sm text-red-700 flex-1">{error}</p>
              <button onClick={fetchData} className="px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded-lg hover:bg-red-100">
                Retry
              </button>
            </div>
          ) : policies.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 border-2 border-dashed border-gray-200 rounded-xl">
              <ShieldCheck className="h-8 w-8 text-gray-300" />
              <p className="text-gray-400 text-sm">No retention policies registered.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Policy</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Model</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Timestamp Field</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Retention Window</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {policies.map((policy) => (
                    <tr key={policy.label} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">{policy.description}</div>
                        <div className="text-xs text-gray-400">{policy.label}</div>
                      </td>
                      <td className="px-5 py-4 text-gray-700">{policy.app_label}.{policy.model_name}</td>
                      <td className="px-5 py-4 text-gray-700">{policy.timestamp_field}</td>
                      <td className="px-5 py-4">
                        {policy.retention_days === null ? (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
                            Not configured
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                            {policy.retention_days} days
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
};

export default DataRetentionPage;
