'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import Layout from '@/components/layout/Layout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import InvitationForm from '@/components/csm/InvitationForm';
import { CSMInvitation } from '@/types/csm';
import CsmAPI from '@/lib/api/csmApi';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2, AlertCircle, Clock, CheckCircle, ArrowLeft } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const InvitationsPageContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = Number(searchParams.get('project'));
  const projectValid = Number.isFinite(projectId) && projectId > 0;

  const [invitations, setInvitations] = useState<CSMInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const fetchInvitations = useCallback(async () => {
    if (!projectValid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await CsmAPI.getInvitations(projectId);
      setInvitations(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load invitations');
    } finally {
      setLoading(false);
    }
  }, [projectId, projectValid]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const handleRevoke = async (invitation: CSMInvitation) => {
    if (!confirm(`Revoke invitation for ${invitation.email}?`)) return;
    try {
      await CsmAPI.revokeInvitation(invitation.id);
      fetchInvitations();
    } catch {
      alert('Failed to revoke invitation');
    }
  };

  if (!projectValid) {
    return (
      <Layout>
        <div className="p-6 text-center text-gray-500">No active project selected.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/select-project')}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Member Invitations</h1>
              <p className="text-sm text-gray-500 mt-1">
                Invite new members to join your support team
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            <Plus size={16} />
            Invite Member
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-800">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : invitations.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No pending invitations</p>
            <p className="text-sm mt-1">Invite team members to get started.</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      {inv.accepted ? (
                        <span className="inline-flex items-center gap-1 text-green-700 text-sm">
                          <CheckCircle size={14} />
                          Accepted
                        </span>
                      ) : inv.is_expired ? (
                        <span className="inline-flex items-center gap-1 text-red-600 text-sm">
                          <AlertCircle size={14} />
                          Expired
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-yellow-600 text-sm">
                          <Clock size={14} />
                          Pending
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(inv.expires_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {!inv.accepted && (
                        <button
                          onClick={() => handleRevoke(inv)}
                          className="p-1.5 text-gray-400 hover:text-red-600"
                          title="Revoke"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Invite Modal */}
        <Modal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Invite Member</h2>
            <InvitationForm
              projectId={projectId}
              onSuccess={() => {
                setIsInviteModalOpen(false);
                fetchInvitations();
              }}
              onCancel={() => setIsInviteModalOpen(false)}
            />
          </div>
        </Modal>
      </div>
    </Layout>
  );
};

export default function InvitationsPage() {
  return (
    <ProtectedRoute requiredAuth={true}>
      <InvitationsPageContent />
    </ProtectedRoute>
  );
}
