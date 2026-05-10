'use client';

import { useCallback, useEffect, useState } from 'react';
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

interface LinearPushTaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: number;
  /** When set, only update Linear (no team picker). */
  linearIssueId?: string | null;
  onSuccess?: () => void | Promise<void>;
}

export default function LinearPushTaskDialog({
  isOpen,
  onClose,
  taskId,
  linearIssueId,
  onSuccess,
}: LinearPushTaskDialogProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [teamId, setTeamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);

  const linked = Boolean((linearIssueId || '').trim());

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
    if (linked) {
      setConnected(true);
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
  }, [isOpen, linked, reset]);

  const runPush = async (tid: string | undefined) => {
    setPushing(true);
    try {
      const result = await linearApi.pushTask({ task_id: taskId, team_id: tid });
      const verb = result.action === 'updated' ? 'Updated' : 'Created';
      toast.success(`${verb} Linear issue.`);
      await onSuccess?.();
      onClose();
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const d = e.response?.data as {
          linear_graphql_errors?: Array<{ message?: string }>;
        };
        const st = e.response?.status;
        let msg = getApiErrorDetail(
          e,
          st === 422 || st === 502
            ? 'Linear rejected the request. Reconnect under Integrations (scopes: read, write, issues:create) or check Network → Response.'
            : 'Could not sync to Linear.'
        );
        const ge = d?.linear_graphql_errors;
        if (Array.isArray(ge) && ge.length) {
          const parts = ge
            .map((x) => (x && typeof x.message === 'string' ? x.message : ''))
            .filter(Boolean);
          if (parts.length) msg = `${msg} (${parts.join(' · ')})`;
        }
        toast.error(msg, { duration: 10000 });
      } else {
        toast.error('Could not sync to Linear.');
      }
    } finally {
      setPushing(false);
    }
  };

  const handleConfirm = () => {
    if (linked) {
      void runPush(undefined);
      return;
    }
    if (!teamId) {
      toast.error('Select a Linear team.');
      return;
    }
    void runPush(teamId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sync to Linear</DialogTitle>
          <DialogDescription>
            {linked
              ? 'Update the linked Linear issue with this task’s title and description.'
              : 'Create a new Linear issue from this task. Choose which team it belongs to.'}
          </DialogDescription>
        </DialogHeader>

        {loading && !linked ? (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : connected === false ? (
          <p className="text-sm text-gray-600">
            Connect Linear under Profile → Integrations, then try again. Pushing to Linear needs{' '}
            <strong>read & write</strong> access — disconnect and reconnect if you connected before
            this feature existed.
          </p>
        ) : linked ? (
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pushing}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={pushing}>
              {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="ml-2">Update Linear</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div>
              <label htmlFor="linear-push-team" className="mb-1 block text-xs font-medium text-gray-700">
                Linear team
              </label>
              <select
                id="linear-push-team"
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
              <Button type="button" onClick={handleConfirm} disabled={pushing || !teamId}>
                {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="ml-2">Create in Linear</span>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
