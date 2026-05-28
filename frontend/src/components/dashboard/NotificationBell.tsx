'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, CheckCircle, XCircle, Building2 } from 'lucide-react';
import AlertCard from './AlertCard';
import type { AlertData, AlertStatus } from '@/lib/mock/dashboardMock';
import CsmAPI from '@/lib/api/csmApi';
import type { CsmNotification } from '@/types/csm';

interface NotificationBellProps {
  alerts: AlertData[];
}

type FilterKey = 'all' | 'critical' | 'warning' | 'info' | 'csm';

const filters: { value: FilterKey; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'csm', label: 'CSM' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
];

export default function NotificationBell({ alerts }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [localAlerts, setLocalAlerts] = useState<AlertData[]>(alerts);
  const [csmNotifications, setCsmNotifications] = useState<CsmNotification[]>([]);
  const [csmUnread, setCsmUnread] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalAlerts(alerts);
  }, [alerts]);

  // Fetch CSM notifications
  const fetchCsmNotifications = useCallback(async () => {
    try {
      const [notifs, count] = await Promise.all([
        CsmAPI.getNotifications(),
        CsmAPI.getUnreadCount(),
      ]);
      setCsmNotifications(notifs);
      setCsmUnread(count);
    } catch {
      // Silently fail — user may not have CSM access
    }
  }, []);

  useEffect(() => {
    fetchCsmNotifications();
  }, [fetchCsmNotifications]);

  // Re-fetch when panel opens
  useEffect(() => {
    if (open) fetchCsmNotifications();
  }, [open, fetchCsmNotifications]);

  useEffect(() => {
    if (!open) return;

    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const openAlerts = localAlerts.filter((a) => a.status === 'open');
  const totalUnread = openAlerts.length + csmUnread;

  const visible = filter === 'all'
    ? openAlerts
    : filter === 'csm'
    ? []
    : openAlerts.filter((a) => a.severity === filter);

  const visibleCsm = filter === 'all' || filter === 'csm'
    ? csmNotifications.filter((n) => !n.is_read || n.action_status === 'pending')
    : [];

  const handleAction = (id: number, action: Exclude<AlertStatus, 'open'>) => {
    setLocalAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: action } : a)));
  };

  const handleCsmAccept = async (id: number) => {
    try {
      await CsmAPI.acceptNotification(id);
      fetchCsmNotifications();
    } catch {
      // ignore
    }
  };

  const handleCsmDecline = async (id: number) => {
    try {
      await CsmAPI.declineNotification(id);
      fetchCsmNotifications();
    } catch {
      // ignore
    }
  };

  const markAllRead = () => {
    setLocalAlerts((prev) => prev.map((a) => (a.status === 'open' ? { ...a, status: 'dismissed' } : a)));
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative h-8 w-8 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="w-4 h-4 text-gray-600" />
        {totalUnread > 0 && (
          <span
            data-notification-badge
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center leading-none"
          >
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          data-notification-panel
          className="fixed left-16 right-2 top-14 z-50 mt-0 flex max-h-[calc(100vh-4.5rem)] w-auto flex-col rounded-lg border border-gray-200 bg-white shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[560px] sm:w-[380px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              {totalUnread > 0 && (
                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                  {totalUnread} new
                </span>
              )}
            </div>
            {openAlerts.length > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Check className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100">
            {filters.map((f) => {
              const active = filter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {/* CSM Notifications */}
            {visibleCsm.map((n) => (
              <div key={`csm-${n.id}`} className="p-3 rounded-lg border border-gray-100 bg-white hover:bg-gray-50">
                <div className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                    {n.message && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {n.sender_name || n.sender_email} &middot; {new Date(n.created_at).toLocaleDateString()}
                    </p>

                    {n.action_status === 'pending' && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleCsmAccept(n.id)}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-green-700 bg-green-50 rounded hover:bg-green-100"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Accept
                        </button>
                        <button
                          onClick={() => handleCsmDecline(n.id)}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-red-700 bg-red-50 rounded hover:bg-red-100"
                        >
                          <XCircle className="w-3 h-3" />
                          Decline
                        </button>
                      </div>
                    )}

                    {n.action_status === 'accepted' && (
                      <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-green-600">
                        <CheckCircle className="w-3 h-3" /> Accepted
                      </span>
                    )}
                    {n.action_status === 'declined' && (
                      <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-red-500">
                        <XCircle className="w-3 h-3" /> Declined
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* System Alerts */}
            {visible.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onAction={handleAction} />
            ))}

            {visible.length === 0 && visibleCsm.length === 0 && (
              <div className="py-10 text-center text-xs text-gray-400">
                <Bell className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                All caught up.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
