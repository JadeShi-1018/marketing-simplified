'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Bell, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AlertCard from './AlertCard';
import { notificationsApi } from '@/lib/api/notificationsApi';
import { useNotificationStore } from '@/lib/notificationStore';
import { useNotificationDrawer } from '@/components/notifications/NotificationDrawerProvider';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { NotificationItem, NotificationTab } from '@/types/notifications';
import type { AlertData, AlertStatus } from '@/lib/mock/dashboardMock';

// ── Tab config ────────────────────────────────────────────────────────────────

type TabKey = NotificationTab;

const TABS: { value: TabKey; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'mentions', label: 'Mentions' },
  { value: 'deadlines', label: 'Deadlines' },
];

// ── Category colour bar ───────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<string, string> = {
  MEETINGS: 'bg-blue-500',
  TASKS: 'bg-orange-400',
  DECISIONS: 'bg-purple-500',
  COLLABORATION: 'bg-teal-500',
  SYSTEM: 'bg-gray-400',
  AUTOMATION: 'bg-indigo-400',
};

const categoryColor = (category: string) =>
  CATEGORY_COLOR[category?.toUpperCase()] ?? 'bg-gray-400';

// ── Single real notification card ─────────────────────────────────────────────

function NotifCard({
  item,
  onClick,
}: {
  item: NotificationItem;
  onClick: (item: NotificationItem) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="relative border-[0.5px] border-gray-200 rounded-lg bg-white overflow-hidden cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={() => onClick(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(item);
      }}
    >
      {/* Category colour bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${categoryColor(item.category)}`} />

      <div className="pl-4 pr-3 py-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p
            className={`min-w-0 text-[13px] leading-snug ${
              item.is_read ? 'text-gray-700' : 'font-semibold text-gray-900'
            }`}
          >
            {item.title}
          </p>
          {!item.is_read && (
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden />
          )}
        </div>
        {item.body ? (
          <p className="mt-0.5 text-[12px] text-gray-500 line-clamp-1">{item.body}</p>
        ) : null}
        <p className="mt-1.5 text-[11px] text-gray-400">
          {formatRelativeTime(item.created_at)}
        </p>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface NotificationBellProps {
  /** AI/budget anomaly alerts passed from the page (e.g. Overview). */
  alerts?: AlertData[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NotificationBell({ alerts = [] }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // AI alerts state (Plan B — collapsible section at the bottom)
  const [localAlerts, setLocalAlerts] = useState<AlertData[]>(alerts);
  const [alertsExpanded, setAlertsExpanded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const { lastRefresh, setUnreadCount: setGlobalUnreadCount } = useNotificationStore();
  const { openDrawer } = useNotificationDrawer();

  // Keep local alerts in sync with prop
  useEffect(() => {
    setLocalAlerts(alerts);
  }, [alerts]);

  // Fetch notifications from real API
  const fetchNotifications = useCallback(async (activeTab: TabKey) => {
    setLoading(true);
    try {
      const { data } = await notificationsApi.list({
        page_size: 20,
        tab: activeTab === 'all' ? undefined : activeTab,
      });
      setItems(data.results);
      setUnreadCount(data.unread_count ?? 0);
      setGlobalUnreadCount(data.unread_count ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [setGlobalUnreadCount]);

  // Re-fetch when panel opens or SSE triggers a refresh
  useEffect(() => {
    if (open) {
      void fetchNotifications(tab);
    }
  }, [open, tab, lastRefresh, fetchNotifications]);

  // Also keep the badge count fresh (even when panel is closed)
  useEffect(() => {
    void notificationsApi
      .list({ page_size: 1 })
      .then(({ data }) => {
        setUnreadCount(data.unread_count ?? 0);
        setGlobalUnreadCount(data.unread_count ?? 0);
      })
      .catch(() => {});
  }, [lastRefresh, setGlobalUnreadCount]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Mark all real notifications as read
  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markRead({ mark_all: true });
      await fetchNotifications(tab);
    } catch {
      // non-critical
    }
  };

  // Dismiss all AI alerts locally
  const handleAlertAction = (id: number, action: Exclude<AlertStatus, 'open'>) => {
    setLocalAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: action } : a)));
  };

  const handleNotifClick = (item: NotificationItem) => {
    setOpen(false);
    openDrawer(item);
  };

  const openAlerts = localAlerts.filter((a) => a.status === 'open');
  // Badge only reflects real unread notifications; AI system alerts are shown
  // in their own collapsible section and should not inflate the bell count.
  const totalBadge = unreadCount;

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative h-8 w-8 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="w-4 h-4 text-gray-600" />
        {totalBadge > 0 && (
          <span
            data-notification-badge
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center leading-none"
          >
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          data-notification-panel
          className="fixed left-16 right-2 top-14 z-50 mt-0 flex max-h-[calc(100vh-4.5rem)] w-auto flex-col rounded-lg border border-gray-200 bg-white shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[560px] sm:w-[380px]"
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => void handleMarkAllRead()}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Check className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* ── Tab filters ── */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100">
            {TABS.map((t) => {
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* ── Real notification list ── */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {loading ? (
              <p className="py-10 text-center text-xs text-gray-400">Loading…</p>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-xs text-gray-400">
                <Bell className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                All caught up.
              </div>
            ) : (
              items.map((item) => (
                <NotifCard key={item.id} item={item} onClick={handleNotifClick} />
              ))
            )}

            {/* ── Plan B: Collapsible AI System Alerts section ── */}
            {openAlerts.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-2">
                <button
                  onClick={() => setAlertsExpanded((v) => !v)}
                  className="flex w-full items-center justify-between px-1 py-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700 transition-colors"
                >
                  <span>System Alerts ({openAlerts.length})</span>
                  {alertsExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
                {alertsExpanded && (
                  <div className="space-y-2 mt-1">
                    {openAlerts.map((alert) => (
                      <AlertCard key={alert.id} alert={alert} onAction={handleAlertAction} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="border-t border-gray-100 px-4 py-2.5 text-center shrink-0">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-[12px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
