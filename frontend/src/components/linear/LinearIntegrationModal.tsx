'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, KanbanSquare, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { linearApi } from '@/lib/api/linearApi';

interface LinearIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Keeps Integrations list row in sync without a full page refresh */
  onStatusChange?: (connected: boolean) => void;
}

export default function LinearIntegrationModal({
  isOpen,
  onClose,
  onStatusChange,
}: LinearIntegrationModalProps) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    linearApi
      .getStatus()
      .then((s) => {
        setConnected(s.connected);
        onStatusChange?.(s.connected);
      })
      .catch((e) => {
        setConnected(false);
        onStatusChange?.(false);
        if (axios.isAxiosError(e)) {
          if (!e.response) {
            toast.error(
              'Could not reach the API. Open the app via the same URL as your backend (e.g. http://localhost, not :3000 alone).',
              { duration: 8000 }
            );
            return;
          }
          const d = e.response.data as { detail?: string; error?: string } | undefined;
          const msg = d?.detail || d?.error;
          if (e.response.status >= 500 && msg) {
            toast.error(msg, { duration: 8000 });
          }
        }
      })
      .finally(() => setLoading(false));
  }, [isOpen, onStatusChange]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { auth_url } = await linearApi.connect();
      window.location.href = auth_url;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const st = e.response?.status;
        const data = e.response?.data as {
          detail?: string;
          error?: string;
          missing_env?: string[];
        } | undefined;
        let msg: string | null = data?.detail || data?.error || null;
        if (st === 503 && data?.missing_env?.length) {
          msg = `Linear is not configured. Set ${data.missing_env.join(', ')} in the backend .env and restart.`;
        }
        if (!msg && (st === 404 || st === 503)) {
          msg = 'Linear API is not available on the server. Run migrations and set LINEAR_* in .env.';
        }
        toast.error(msg || 'Failed to start Linear connection. Please try again.', { duration: 8000 });
      } else {
        toast.error('Failed to start Linear connection. Please try again.');
      }
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await linearApi.disconnect();
      setConnected(false);
      onStatusChange?.(false);
      toast.success('Linear disconnected.');
    } catch {
      toast.error('Failed to disconnect Linear.');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KanbanSquare className="h-5 w-5 text-[#5E6AD2]" />
            Linear Integration
          </DialogTitle>
          <DialogDescription>
            Connect your Linear account to import issues, sync tasks to Linear, and open Linear from here.
            Authorization includes read, write, and issues:create so tasks can be pushed as new Linear issues.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#5E6AD2]" />
            </div>
          ) : connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-900">Linear connected</p>
                  <p className="text-xs text-green-700">Your account is linked. You can open Linear anytime below.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="w-full rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {disconnecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Disconnecting…
                  </span>
                ) : (
                  'Disconnect Linear'
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Sign in with Linear in your browser. After you authorize, you can continue in Linear.
              </p>
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="w-full rounded-lg bg-gradient-to-r from-[#5E6AD2] to-[#7B8CFF] px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-50"
              >
                {connecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirecting to Linear…
                  </span>
                ) : (
                  'Connect Linear'
                )}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
