'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import TierBadge from '@/components/csm/TierBadge';
import QueueForm from '@/components/csm/QueueForm';
import { Queue, QueueTicketCounts } from '@/types/csm';
import CsmAPI from '@/lib/api/csmApi';
import { Plus, Pencil, Trash2, AlertCircle, Inbox } from 'lucide-react';

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

  const handleDelete = async (queue: Queue) => {
    if (!confirm(`Are you sure you want to delete "${queue.name}"?`)) return;
    try { await CsmAPI.deleteQueue(queue.id); fetchQueues(); } catch { alert('Failed to delete queue'); }
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
                return (
                  <tr key={queue.id} className="transition hover:bg-gray-50/80">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-gray-900">{queue.name}</div>
                      {queue.description && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{queue.description}</p>}
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
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(queue)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
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
    </div>
  );
};

export default QueuesTab;
