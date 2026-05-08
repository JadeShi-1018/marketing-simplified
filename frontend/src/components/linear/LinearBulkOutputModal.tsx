'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Loader2, Send } from 'lucide-react';
import toast from 'react-hot-toast';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getApiErrorDetail } from '@/lib/api/errorMessage';
import { linearApi, type LinearTeam } from '@/lib/api/linearApi';
import type { TaskData } from '@/types/task';

interface LinearBulkOutputModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskIds: number[];
  tasks: TaskData[];
  onComplete?: () => void | Promise<void>;
}

export default function LinearBulkOutputModal({
  isOpen,
  onClose,
  taskIds,
  tasks,
  onComplete,
}: LinearBulkOutputModalProps) {
  const selectedTasks = useMemo(
    () => tasks.filter((t) => t.id && taskIds.includes(t.id)),
    [tasks, taskIds]
  );
  const anyUnlinked = useMemo(
    () => selectedTasks.some((t) => !(t.linear_issue_id || '').trim()),
    [selectedTasks]
  );
  const [connected, setConnected] = useState<boolean | null>(null);
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [teamId, setTeamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);

  const reset = useCallback(() => {
    setTeams([]);
    setTeamId('');
    setConnected(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      reset();
      return;
    }
    if (taskIds.length === 0) {
      setConnected(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const s = await linearApi.getStatus();
        if (cancelled) return;
        setConnected(s.connected);
        if (!s.connected) return;
        if (!anyUnlinked) {
          setTeams([]);
          return;
        }
        const { teams: t } = await linearApi.listTeams();
        if (cancelled) return;
        setTeams(t);
        if (t.length === 1) setTeamId(t[0].id);
      } catch (e) {
        if (!cancelled) {
          setConnected(false);
          toast.error(getApiErrorDetail(e, 'Could not load Linear.'), { duration: 6000 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, anyUnlinked, reset, taskIds.length]);

  const runPush = async () => {
    if (anyUnlinked && !teamId.trim()) {
      toast.error('Select a Linear team for tasks that are not yet linked.');
      return;
    }
    setPushing(true);
    const failed: string[] = [];
    let created = 0;
    let updated = 0;
    try {
      for (const t of selectedTasks) {
        if (!t.id) continue;
        const linked = Boolean((t.linear_issue_id || '').trim());
        try {
          await linearApi.pushTask({
            task_id: t.id,
            team_id: linked ? undefined : teamId.trim(),
          });
          if (linked) updated += 1;
          else created += 1;
        } catch (e) {
          let msg = getApiErrorDetail(e, 'Request failed');
          if (axios.isAxiosError(e)) {
            const d = e.response?.data as {
              linear_graphql_errors?: Array<{ message?: string }>;
            };
            const ge = d?.linear_graphql_errors;
            if (Array.isArray(ge) && ge.length) {
              const parts = ge
                .map((x) => (x && typeof x.message === 'string' ? x.message : ''))
                .filter(Boolean);
              if (parts.length) msg = `${msg} (${parts.join(' · ')})`;
            }
          }
          failed.push(`${t.summary?.slice(0, 40) || t.id}: ${msg}`);
        }
      }
      if (created || updated) {
        toast.success(
          `Linear: ${created ? `${created} created` : ''}${created && updated ? ', ' : ''}${updated ? `${updated} updated` : ''}.`
        );
      }
      if (failed.length) {
        toast.error(
          `${failed.length} task(s) failed. ${failed.slice(0, 2).join(' · ')}${failed.length > 2 ? '…' : ''}`,
          { duration: 10000 }
        );
      }
      await onComplete?.();
      onClose();
    } finally {
      setPushing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Output to Linear</DialogTitle>
          <DialogDescription>
            Push {taskIds.length} selected task{taskIds.length === 1 ? '' : 's'} to Linear. Linked tasks
            are updated; unlinked tasks create new issues in the team you pick.
          </DialogDescription>
        </DialogHeader>

        {selectedTasks.length > 0 ? (
          <div className="rounded-md border border-gray-100 bg-gray-50/80 px-3 py-2">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Tasks in this push
            </p>
            <ul className="max-h-36 space-y-1 overflow-y-auto text-sm text-gray-800">
              {selectedTasks.map((t) => (
                <li key={t.id} className="flex min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0 truncate">{t.summary || `Task #${t.id}`}</span>
                  {(t.linear_issue_id || '').trim() ? (
                    <span className="shrink-0 text-[11px] text-emerald-600">Linked</span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-amber-600">New issue</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {taskIds.length === 0 ? (
          <p className="text-sm text-gray-600">No tasks selected.</p>
        ) : loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : connected === false ? (
          <p className="text-sm text-gray-600">
            Connect Linear under Profile → Integrations. Use read & write access so issues can be
            created.
          </p>
        ) : anyUnlinked ? (
          <div className="space-y-4 pt-1">
            <div>
              <label htmlFor="linear-bulk-team" className="mb-1 block text-xs font-medium text-gray-700">
                Linear team (for new issues)
              </label>
              <select
                id="linear-bulk-team"
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[#3CCED7] focus:outline-none focus:ring-1 focus:ring-[#3CCED7]"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                disabled={!teams.length || pushing}
              >
                <option value="">Select a team…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.key ? ` (${t.key})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={pushing}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void runPush()} disabled={pushing || !teamId}>
                {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="ml-2">Push to Linear</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              All selected tasks are already linked to Linear issues. Only titles and descriptions
              will be updated.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={pushing}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void runPush()} disabled={pushing}>
                {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="ml-2">Update Linear</span>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
