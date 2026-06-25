'use client';

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import ConfirmModal from '@/components/ui/ConfirmModal';
import TierBadge from '@/components/csm/TierBadge';
import QueueForm from '@/components/csm/QueueForm';
import { Queue, QueueTicketCounts } from '@/types/csm';
import CsmAPI from '@/lib/api/csmApi';
import { TicketAPI } from '@/lib/api/csmConversationApi';
import type { Ticket } from '@/types/csmConversation';
import { Plus, Pencil, Trash2, AlertCircle, Inbox, ChevronDown, ChevronRight } from 'lucide-react';

const TICKET_STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-400',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-50 text-gray-500',
  medium: 'bg-blue-50 text-blue-600',
  high: 'bg-orange-50 text-orange-600',
  urgent: 'bg-red-50 text-red-600',
};

function QueueTicketList({ queueId }: { queueId: number }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await TicketAPI.listByQueue(queueId, statusFilter || undefined);
      setTickets(data);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [queueId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="px-5 pb-4 bg-gray-50 border-t border-gray-100">
      <div className="flex items-center justify-between pt-3 pb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tickets</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded px-2 py-1 outline-none bg-white"
        >
          <option value="">All</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      {loading ? (
        <div className="flex flex-col gap-1.5">
          {[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No tickets found.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {tickets.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-gray-100 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">#{t.id} {t.title}</p>
                {t.assigned_to_name && (
                  <p className="text-xs text-gray-400 truncate">→ {t.assigned_to_name}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TICKET_STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {t.status_display}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[t.priority] ?? 'bg-gray-50 text-gray-400'}`}>
                  {t.priority_display}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface QueuesTabProps {
  projectId: number | string;
  organisationId: number;
}

const QueuesTab: React.FC<QueuesTabProps> = ({ projectId, organisationId }) => {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [ticketCounts, setTicketCounts] = useState<Record<number, QueueTicketCounts>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingQueue, setEditingQueue] = useState<Queue | null>(null);
  const [expandedQueueId, setExpandedQueueId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; queue: Queue | null }>({ open: false, queue: null });
  const [deleting, setDeleting] = useState(false);

  const fetchQueues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await CsmAPI.getQueues({ organisation: organisationId });
      setQueues(Array.isArray(data) ? data : []);
      const counts: Record<number, QueueTicketCounts> = {};
      await Promise.all(
        data.map(async (q) => {
          try { counts[q.id] = await CsmAPI.getTicketCounts(q.id); } catch { counts[q.id] = { todo: 0, in_progress: 0 }; }
        })
      );
      setTicketCounts(counts);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load queues');
    } finally {
      setLoading(false);
    }
  }, [organisationId]);

  useEffect(() => { fetchQueues(); }, [fetchQueues]);

  const handleDeleteConfirm = async () => {
    const queue = deleteConfirm.queue;
    if (!queue) return;
    setDeleting(true);
    try {
      await CsmAPI.deleteQueue(queue.id);
      toast.success(`Queue "${queue.name}" deleted`);
      fetchQueues();
    } catch {
      toast.error('Failed to delete queue');
    } finally {
      setDeleting(false);
      setDeleteConfirm({ open: false, queue: null });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Queues</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage support queues and agent assignments.</p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Queue
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[240px] gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading queues...</p>
        </div>
      ) : queues.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[240px] gap-4 rounded-xl border-2 border-dashed border-gray-200">
          <Inbox className="h-10 w-10 text-gray-300" />
          <p className="text-muted-foreground text-sm">No queues yet.</p>
          <Button variant="outline" size="sm" onClick={() => setIsCreateModalOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Create your first queue
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Name</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">Tier</th>
                <th className="px-5 py-3 text-center text-[11px] font-medium uppercase tracking-wider text-gray-500">To Do</th>
                <th className="px-5 py-3 text-center text-[11px] font-medium uppercase tracking-wider text-gray-500">In Progress</th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {queues.map((queue) => {
                const counts = ticketCounts[queue.id] || { todo: 0, in_progress: 0 };
                const isExpanded = expandedQueueId === queue.id;
                return (
                  <React.Fragment key={queue.id}>
                    <tr className="transition hover:bg-gray-50/80">
                      <td className="px-5 py-3.5">
                        <button
                          className="flex items-center gap-1.5 text-left w-full"
                          onClick={() => setExpandedQueueId(isExpanded ? null : queue.id)}
                        >
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          }
                          <div>
                            <div className="font-medium text-gray-900">{queue.name}</div>
                            {queue.description && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{queue.description}</p>}
                          </div>
                        </button>
                      </td>
                      <td className="px-5 py-3.5"><TierBadge tier={queue.tier} /></td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center justify-center h-7 min-w-[28px] rounded-md bg-gray-100 px-2 text-xs font-medium text-gray-700">{counts.todo}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center justify-center h-7 min-w-[28px] rounded-md bg-blue-50 px-2 text-xs font-medium text-blue-700">{counts.in_progress}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingQueue(queue)} title="Edit">
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteConfirm({ open: true, queue })} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <QueueTicketList queueId={queue.id} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Queue</DialogTitle>
            <DialogDescription>Add a new support queue to this organisation.</DialogDescription>
          </DialogHeader>
          <QueueForm
            projectId={projectId}
            organisationId={organisationId}
            onSuccess={() => { setIsCreateModalOpen(false); fetchQueues(); }}
            onCancel={() => setIsCreateModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingQueue} onOpenChange={(open) => { if (!open) setEditingQueue(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Queue</DialogTitle>
            <DialogDescription>Update queue details.</DialogDescription>
          </DialogHeader>
          {editingQueue && (
            <QueueForm
              projectId={projectId}
              queue={editingQueue}
              onSuccess={() => { setEditingQueue(null); fetchQueues(); }}
              onCancel={() => setEditingQueue(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, queue: null })}
        onConfirm={handleDeleteConfirm}
        loading={deleting}
        type="danger"
        title="Delete Queue"
        message={deleteConfirm.queue ? `Delete queue "${deleteConfirm.queue.name}"? This cannot be undone.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
      />
    </div>
  );
};

export default QueuesTab;
