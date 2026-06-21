'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import PortalAPI from '@/lib/api/portalApi';
import { PortalConversation } from '@/types/portal';
import { initPortalAuth, clearPortalAuth } from '@/lib/portalAuth';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-500',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MyTicketsPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<PortalConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    initPortalAuth().then((token) => {
      if (!token) {
        router.replace('/portal/login');
        return;
      }
      PortalAPI.listConversations()
        .then(setConversations)
        .catch(() => router.replace('/portal/login'))
        .finally(() => setLoading(false));
    });
  }, [router]);

  const handleNewTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      const conv = await PortalAPI.startConversation({ subject, message });
      setConversations((prev) => [conv, ...prev]);
      setShowNewForm(false);
      setSubject('');
      setMessage('');
      router.push(`/portal/tickets/${conv.id}`);
    } catch {
      toast.error('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearPortalAuth();
    router.replace('/portal/login');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#3CCED7] to-[#A6E661] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">My Support Tickets</h1>
            <p className="text-xs text-gray-400">View and manage your support requests</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewForm(true)}
            className="px-4 py-2 text-sm font-medium bg-[#3CCED7] text-white rounded-lg hover:bg-[#2bb8c1] transition-colors"
          >
            + New Ticket
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* New ticket form */}
      {showNewForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Submit a New Request</h2>
          <form onSubmit={handleNewTicket} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject (optional)</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of your issue"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#3CCED7]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Message *</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={4}
                placeholder="Describe your issue in detail…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#3CCED7] resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !message.trim()}
                className="px-4 py-2 text-sm font-medium bg-[#3CCED7] text-white rounded-lg hover:bg-[#2bb8c1] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting…' : 'Submit Ticket'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Ticket list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm mb-4">No support tickets yet.</p>
          <button
            onClick={() => setShowNewForm(true)}
            className="px-5 py-2.5 text-sm font-medium bg-[#3CCED7] text-white rounded-lg hover:bg-[#2bb8c1]"
          >
            Submit Your First Ticket
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => router.push(`/portal/tickets/${conv.id}`)}
              className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-[#3CCED7] hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {conv.subject || `Ticket #${conv.id}`}
                    </span>
                    {conv.unread_count > 0 && (
                      <span className="shrink-0 text-xs bg-[#3CCED7] text-white rounded-full px-1.5 py-0.5 font-medium">
                        {conv.unread_count} new
                      </span>
                    )}
                  </div>
                  {conv.last_message && (
                    <p className="text-xs text-gray-400 truncate">
                      {conv.last_message.sender_type === 'agent' ? 'Agent: ' : 'You: '}
                      {conv.last_message.content}
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[conv.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {conv.status_display}
                  </span>
                  <span className="text-xs text-gray-300">{formatDate(conv.created_at)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
