'use client';

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { TicketAPI } from '@/lib/api/csmConversationApi';
import { useCsmConversationStore } from '@/lib/csmConversationStore';
import type { Ticket } from '@/types/csmConversation';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-gray-400',
  medium: 'text-blue-500',
  high: 'text-orange-500',
  urgent: 'text-red-500',
};

interface MyTicketsPanelProps {
  refreshKey?: number;
}

export function MyTicketsPanel({ refreshKey }: MyTicketsPanelProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [closeConfirm, setCloseConfirm] = useState<{ open: boolean; ticket: Ticket | null }>({
    open: false,
    ticket: null,
  });
  const [closing, setClosing] = useState(false);

  const setActive = useCsmConversationStore((s) => s.setActiveConversation);
  const activeId = useCsmConversationStore((s) => s.activeConversationId);
  const conversations = useCsmConversationStore((s) => s.conversations);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await TicketAPI.myTickets();
      setTickets(data.filter((t) => t.status !== 'closed'));
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleStatusChange = async (ticket: Ticket, newStatus: string) => {
    if (newStatus === 'closed') {
      setCloseConfirm({ open: true, ticket });
      return;
    }
    setUpdatingId(ticket.id);
    try {
      const updated = await TicketAPI.update(ticket.id, { status: newStatus });
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? updated : t)));
      toast.success(`Ticket #${ticket.id} marked as ${updated.status_display}`);
    } catch {
      toast.error('Failed to update ticket status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmClose = async () => {
    const ticket = closeConfirm.ticket;
    if (!ticket) return;
    setClosing(true);
    try {
      await TicketAPI.close(ticket.id);
      setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
      toast.success(`Ticket #${ticket.id} closed`);
    } catch {
      toast.error('Failed to close ticket.');
    } finally {
      setClosing(false);
      setCloseConfirm({ open: false, ticket: null });
    }
  };

  const handleSwitchToConversation = (ticket: Ticket) => {
    if (!ticket.conversation) return;
    const conv = conversations.find((c) => c.id === ticket.conversation);
    if (conv) setActive(conv.id);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            My Active Tickets ({tickets.length})
          </p>
          <button onClick={load} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>

        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
            <p className="text-sm text-gray-400">No active tickets</p>
            <p className="text-xs text-gray-300 mt-1">Claim a conversation to get started</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {tickets.map((ticket) => {
              const isUpdating = updatingId === ticket.id;
              const isActive = ticket.conversation != null && activeId === ticket.conversation;
              return (
                <div
                  key={ticket.id}
                  onClick={() => handleSwitchToConversation(ticket)}
                  className={`rounded-lg border p-3 flex flex-col gap-2 shadow-sm transition-colors ${
                    ticket.conversation
                      ? 'cursor-pointer hover:border-blue-300 hover:bg-blue-50/50'
                      : 'cursor-default'
                  } ${
                    isActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  {/* Title + priority */}
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-semibold leading-snug flex-1 ${isActive ? 'text-blue-800' : 'text-gray-800'}`}>
                      #{ticket.id} {ticket.title}
                    </p>
                    <span className={`text-xs font-medium shrink-0 ${PRIORITY_COLORS[ticket.priority] ?? 'text-gray-400'}`}>
                      {ticket.priority_display}
                    </span>
                  </div>

                  {/* Queue + status badge */}
                  <div className="flex items-center gap-1.5">
                    {ticket.queue_name && (
                      <span className="text-xs text-gray-400 truncate flex-1">{ticket.queue_name}</span>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[ticket.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {ticket.status_display}
                    </span>
                  </div>

                  {/* Status action buttons */}
                  <div className="flex gap-1.5 pt-1 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                    {ticket.status !== 'resolved' ? (
                      <button
                        onClick={() => handleStatusChange(ticket, 'resolved')}
                        disabled={isUpdating}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md bg-green-50 text-green-700 hover:bg-green-100 text-xs font-medium disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 size={12} />
                        {isUpdating ? 'Updating…' : 'Mark Resolved'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(ticket, 'in_progress')}
                        disabled={isUpdating}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md bg-yellow-50 text-yellow-700 hover:bg-yellow-100 text-xs font-medium disabled:opacity-50 transition-colors"
                      >
                        {isUpdating ? 'Updating…' : 'Reopen'}
                      </button>
                    )}
                    <button
                      onClick={() => handleStatusChange(ticket, 'closed')}
                      disabled={isUpdating}
                      className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium disabled:opacity-50 transition-colors"
                    >
                      <XCircle size={12} />
                      Close
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={closeConfirm.open}
        onClose={() => setCloseConfirm({ open: false, ticket: null })}
        onConfirm={handleConfirmClose}
        loading={closing}
        type="danger"
        title="Close Ticket"
        message={
          closeConfirm.ticket
            ? `Close ticket #${closeConfirm.ticket.id} "${closeConfirm.ticket.title}"? This will notify the customer.`
            : ''
        }
        confirmText="Close Ticket"
        cancelText="Cancel"
      />
    </>
  );
}
