'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MessageSquare } from 'lucide-react';
import { TicketAPI } from '@/lib/api/csmConversationApi';
import type { Ticket } from '@/types/csmConversation';
import CsmSettingsDrawerShell from '@/components/csm-settings/CsmSettingsDrawerShell';
import { CsmPriorityBadge } from '@/components/csm/CsmPriorityBadge';
import { SlaCountdown } from './SlaCountdown';

interface Props {
  ticket: Ticket | null;
  open: boolean;
  onClose: () => void;
  /** A status change succeeded — parent refreshes its list row. */
  onUpdated: (ticket: Ticket) => void;
  onOpenConversation: (conversationId: number) => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-28 shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-sm text-gray-700">{children}</div>
    </div>
  );
}

export default function TicketDetailDrawer({
  ticket,
  open,
  onClose,
  onUpdated,
  onOpenConversation,
}: Props) {
  const [updating, setUpdating] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [desc, setDesc] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);

  // Keep the SLA countdown fresh while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [open]);

  // Reset the editable description when the drawer switches tickets or the
  // ticket's saved description changes.
  useEffect(() => {
    setDesc(ticket?.description ?? '');
  }, [ticket?.id, ticket?.description]);

  if (!ticket) return null;

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === ticket.status) return;
    setUpdating(true);
    try {
      const updated = await TicketAPI.update(ticket.id, { status: newStatus });
      onUpdated(updated);
      toast.success(`Ticket #${ticket.id} marked as ${updated.status_display}`);
    } catch {
      toast.error('Failed to update ticket status.');
    } finally {
      setUpdating(false);
    }
  };

  const saveDescription = async () => {
    setSavingDesc(true);
    try {
      const updated = await TicketAPI.update(ticket.id, { description: desc });
      onUpdated(updated);
      toast.success('Description saved.');
    } catch {
      toast.error('Failed to save description.');
    } finally {
      setSavingDesc(false);
    }
  };

  const nextStatuses = ticket.available_next_statuses ?? [];
  const descDirty = desc !== (ticket.description ?? '');

  return (
      <CsmSettingsDrawerShell
        open={open}
        onClose={onClose}
        title={`Ticket #${ticket.id}`}
        footer={
          ticket.conversation != null ? (
            <button
              type="button"
              onClick={() => onOpenConversation(ticket.conversation as number)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <MessageSquare size={14} />
              Open conversation
            </button>
          ) : null
        }
      >
        <div className="flex flex-col gap-1 overflow-y-auto px-6 py-4">
          <h3 className="mb-2 text-base font-semibold text-gray-900">{ticket.title}</h3>

          <div className="divide-y divide-gray-100">
            <Row label="Status">
              <div className="flex items-center gap-2">
                {ticket.status_color && (
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: ticket.status_color }}
                    aria-hidden
                  />
                )}
                <select
                  value={ticket.status}
                  disabled={updating || nextStatuses.length === 0}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-700 disabled:opacity-70 focus:outline-none focus:ring-1 focus:ring-blue-300"
                >
                  <option value={ticket.status}>{ticket.status_display}</option>
                  {nextStatuses.map((next) => (
                    <option key={next.slug} value={next.slug}>{next.name}</option>
                  ))}
                </select>
              </div>
            </Row>

            <Row label="Priority">
              <CsmPriorityBadge priority={ticket.priority} size="md" />
            </Row>

            <Row label="SLA">
              <SlaCountdown ticket={ticket} now={now} />
            </Row>

            <Row label="Queue">{ticket.queue_name ?? '—'}</Row>

            <Row label="Assignee">{ticket.assigned_to_name ?? 'Unassigned'}</Row>

            <Row label="Created">
              {new Date(ticket.created_at).toLocaleString()}
            </Row>
          </div>

          <div className="mt-4">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Description
            </span>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
              placeholder="Add a description…"
              className="mt-1 w-full resize-y rounded-md border border-gray-200 px-2.5 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            {descDirty && (
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDesc(ticket.description ?? '')}
                  disabled={savingDesc}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveDescription}
                  disabled={savingDesc}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingDesc ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      </CsmSettingsDrawerShell>
  );
}
