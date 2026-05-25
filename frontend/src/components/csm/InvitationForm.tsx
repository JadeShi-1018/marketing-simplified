'use client';

import React, { useState } from 'react';
import CsmAPI from '@/lib/api/csmApi';
import { CSMInvitation } from '@/types/csm';

interface InvitationFormProps {
  projectId: number;
  onSuccess: (invitation: CSMInvitation) => void;
  onCancel: () => void;
}

const InvitationForm: React.FC<InvitationFormProps> = ({ projectId, onSuccess, onCancel }) => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const invitation = await CsmAPI.sendInvitation({ email, project: projectId });
      onSuccess(invitation);
    } catch (err: any) {
      const detail =
        err?.response?.data?.email?.[0] ||
        err?.response?.data?.detail ||
        'Failed to send invitation';
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email Address <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="colleague@company.com"
          disabled={submitting}
        />
        <p className="mt-1 text-xs text-gray-500">
          The invitation link will expire after 72 hours.
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          disabled={submitting}
        >
          {submitting ? 'Sending...' : 'Send Invitation'}
        </button>
      </div>
    </form>
  );
};

export default InvitationForm;
