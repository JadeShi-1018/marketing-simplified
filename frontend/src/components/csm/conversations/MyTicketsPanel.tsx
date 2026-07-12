'use client';

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Clock, RefreshCw, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { TicketAPI } from '@/lib/api/csmConversationApi';
import { useCsmConversationStore } from '@/lib/csmConversationStore';
import type { Ticket } from '@/types/csmConversation';
import { PRIORITY_LABELS } from '@/types/csm';
import ConfirmModal from '@/components/ui/ConfirmModal';

const STATUS_COLORS: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved:    'bg-green-100 text-green-700',
  closed:      'bg-gray-100 text-gray-400',
};

const PRIORITY_BORDER_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high:     '#fb923c',
  medium:   '#60a5fa',
  low:      '#d1d5db',
};

const PRIORITY_TEXT_COLOR: Record<string, string> = {
  critical: 'text-red-500',
  high:     'text-orange-400',
  medium:   'text-blue-400',
  low:      'text-gray-400',
};

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'Overdue';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function slaColor(seconds: number, breached: boolean): string {
  if (breached || seconds <= 0) return 'text-red-600';
  if (seconds < 3600) return 'text-orange-500';
  return 'text-gray-400';
}

interface SlaCountdownProps {
  ticket: Ticket;
  now: number;
}

function SlaCountdown({ ticket, now }: SlaCountdownProps) {
  const { sla, first_response_due, resolution_due } = ticket;
  if (!first_response_due && !resolution_due) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-gray-300">
        <Clock size={10} className="shrink-0" />
        No SLA
      </span>
    );
  }

  const frSec = first_response_due
    ? Math.floor((new Date(first_response_due).getTime() - now) / 1000)
    : null;
  const resSec = resolution_due
    ? Math.floor((new Date(resolution_due).getTime() - now) / 1000)
    : null;

  const frBreached = sla?.first_response_breached || (frSec !== null && frSec <= 0);
  const resBreached = sla?.resolution_breached || (resSec !== null && resSec <= 0);

  return (
    <span className="flex items-center gap-1 text-[11px]">
      <Clock size={10} className="shrink-0 text-gray-400" />
      {frSec !== null && (
        <span className={slaColor(frSec, frBreached)}>
          {frBreached ? 'Overdue' : formatRemaining(frSec)}
        </span>
      )}
      {frSec !== null && resSec !== null && (
        <span className="text-gray-300">·</span>
      )}
      {resSec !== null && (
        <span className={slaColor(resSec, resBreached)}>
          Res {resBreached ? 'overdue' : formatRemaining(resSec)}
        </span>
      )}
    </span>
  );
}

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
  const [now, setNow] = useState(() => Date.now());

  const setActive = useCsmConversationStore((s) => s.setActiveConversation);
  const activeId = useCsmConversationStore((s) => s.activeConversationId);
  const conversations = useCsmConversationStore((s) => s.conversations);

  // Tick every minute so SLA countdowns stay fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Sort by priority (Critical first) so the most urgent tickets appear at top
      const data = await TicketAPI.myTickets('priority');
      setTickets(data.filter((t) => t.status !== 'closed'));
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Re-fetch when user switches back to this tab/page (e.g. after changing SLA policy)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

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
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
        ))}
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
          <button
            onClick={load}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh"
          >
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
              const borderColor = PRIORITY_BORDER_COLOR[ticket.priority] ?? '#d1d5db';

              return (
                <div
                  key={ticket.id}
                  onClick={() => handleSwitchToConversation(ticket)}
                  style={{ borderLeftColor: borderColor }}
                  className={`rounded-lg border border-gray-200 border-l-[3px] p-2.5 flex flex-col gap-1.5 transition-colors ${
                    ticket.conversation
                      ? 'cursor-pointer hover:border-gray-300 hover:bg-gray-50/60'
                      : 'cursor-default'
                  } ${isActive ? 'bg-blue-50/60 border-gray-200' : 'bg-white'}`}
                >
                  {/* Row 1: title + status badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col min-w-0">
                      <p className={`text-xs font-semibold truncate leading-snug ${isActive ? 'text-blue-800' : 'text-gray-800'}`}>
                        #{ticket.id} {ticket.title}
                      </p>
                      {ticket.queue_name && (
                        <span className="text-[10px] text-gray-400 truncate">{ticket.queue_name}</span>
                      )}
                      {ticket.conversation != null && (
                        <span className="text-[10px] text-blue-400 truncate">
                          Conversation #{ticket.conversation}
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${STATUS_COLORS[ticket.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {ticket.status_display}
                    </span>
                  </div>

                  {/* Row 2: priority · SLA */}
                  <div className="flex items-center gap-1 min-w-0">
                    <span className={`text-[11px] font-medium shrink-0 ${PRIORITY_TEXT_COLOR[ticket.priority] ?? 'text-gray-400'}`}>
                      {PRIORITY_LABELS[ticket.priority as keyof typeof PRIORITY_LABELS] ?? ticket.priority}
                    </span>
                    <span className="text-gray-200 shrink-0">·</span>
                    <SlaCountdown ticket={ticket} now={now} />
                  </div>

                  {/* Row 3: action buttons */}
                  <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {ticket.status !== 'resolved' ? (
                      <button
                        onClick={() => handleStatusChange(ticket, 'resolved')}
                        disabled={isUpdating}
                        title="Mark Resolved"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-600 hover:bg-green-100 text-[10px] font-medium disabled:opacity-40 transition-colors"
                      >
                        <CheckCircle2 size={11} />
                        Resolve
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(ticket, 'in_progress')}
                        disabled={isUpdating}
                        title="Reopen"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-600 hover:bg-yellow-100 text-[10px] font-medium disabled:opacity-40 transition-colors"
                      >
                        <RotateCcw size={11} />
                        Reopen
                      </button>
                    )}
                    <button
                      onClick={() => handleStatusChange(ticket, 'closed')}
                      disabled={isUpdating}
                      title="Close Ticket"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-500 hover:bg-red-100 text-[10px] font-medium disabled:opacity-40 transition-colors"
                    >
                      <XCircle size={11} />
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
