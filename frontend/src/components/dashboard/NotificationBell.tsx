'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, ChevronDown, ChevronUp, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AlertCard from './AlertCard';
import { notificationsApi } from '@/lib/api/notificationsApi';
import { useNotificationStore } from '@/lib/notificationStore';
import { useNotificationDrawer } from '@/components/notifications/NotificationDrawerProvider';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { NotificationItem, NotificationTab } from '@/types/notifications';
import { NOTIFICATION_EVENT } from '@/types/notifications';
import type { AlertData, AlertStatus } from '@/lib/mock/dashboardMock';
import {
  getDecisionPublishedSVODescription,
  getDecisionReviewSVODescription,
} from '@/lib/decisionNotificationCopy';
import {
  getBudgetSVODescription,
  isBudgetNotification,
} from '@/lib/budgetNotificationCopy';
import {
  getTaskChangeSVODescription,
  getTaskStatusChangeSVODescription,
} from '@/lib/taskNotificationCopy';

// ── Tab config ────────────────────────────────────────────────────────────────

type TabKey = NotificationTab;

const TABS: { value: TabKey; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'mentions', label: 'Mentions' },
  { value: 'deadlines', label: 'Deadlines' },
];

// ── Inline actor chip with avatar ─────────────────────────────────────────────

function InlineActorChip({ name, avatar }: { name: string; avatar?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3CCED7] to-[#A6E661] text-[8px] font-semibold text-white overflow-hidden">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </span>
      <span className="font-medium text-gray-700">{name}</span>
    </span>
  );
}

// ── Generate SVO description for notification ─────────────────────────────────

function getSVODescription(item: NotificationItem): React.ReactNode {
  const { event_type, metadata, body } = item;
  const actorName = item.actor_name || (metadata?.actor_name as string) || null;

  // If no actor, just return the body
  if (!actorName) {
    return body || null;
  }

  const actorChip = <InlineActorChip name={actorName} avatar={item.actor_avatar} />;

  if (event_type === 'task_status_changed') {
    return getTaskStatusChangeSVODescription(item, actorChip);
  }

  const taskChangeSvo = getTaskChangeSVODescription(item, actorChip);
  if (taskChangeSvo) {
    return taskChangeSvo;
  }

  switch (event_type) {
    case 'task_assigned':
      return <>{actorChip} assigned you to this task.</>;
    case 'task_owner_changed':
      return <>Task ownership transferred by {actorChip}.</>;
    case 'task_comment_mention':
      return <>{actorChip} mentioned you in a comment.</>;
    case 'meeting_created':
      return <>{actorChip} created a new meeting.</>;
    case 'meeting_updated':
      return <>{actorChip} updated the meeting details.</>;
    case 'meeting_participant_added':
      return <>{actorChip} added you to the meeting.</>;
    case 'meeting_participant_removed':
      return <>{actorChip} removed you from this meeting.</>;
    case 'meeting_agenda_changed':
      return <>{actorChip} updated the meeting agenda.</>;
    case 'project_invite':
      return <>{actorChip} invited you to join.</>;
    case 'account_permission':
      if (metadata?.action === 'project_owner_transferred') {
        return <>{actorChip} transferred project ownership to you.</>;
      }
      if (metadata?.action === 'removed_from_project') {
        return <>{actorChip} removed you from this project.</>;
      }
      return body || null;
    case 'decision_review_needed':
      return getDecisionReviewSVODescription(item, actorChip);
    case 'decision_published':
      return getDecisionPublishedSVODescription(item, actorChip);
    case 'budget_review_needed':
    case 'budget_approval_result':
    case 'budget_pool_low':
    case 'budget_escalation':
      return getBudgetSVODescription(item, actorChip);
    case 'task_deadline_soon':
      return <>This task is due soon. Don&apos;t forget to complete it!</>;
    default:
      // Fallback: show body or generic description
      return body || null;
  }
}

// ── Single real notification card ─────────────────────────────────────────────

function NotifCard({
  item,
  onClick,
}: {
  item: NotificationItem;
  onClick: (item: NotificationItem) => void;
}) {
  // Check if this is a chat/message notification
  const isChatNotification =
    item.event_type === NOTIFICATION_EVENT.CHAT_NEW_MESSAGE ||
    item.event_type === NOTIFICATION_EVENT.CHAT_NEW_CONVERSATION;
  const messageCount = (item.metadata?.message_count as number) || 1;
  const showMessageCount = item.event_type === NOTIFICATION_EVENT.CHAT_NEW_MESSAGE && messageCount > 1;

  // For non-message notifications, use SVO description with actor avatar
  const svoDescription = !isChatNotification ? getSVODescription(item) : null;

  // For message notifications, get actor info
  const actorName = item.actor_name || (item.metadata?.actor_name as string) || null;

  // Build message title text
  const getMessageTitleText = () => {
    if (!actorName) return item.title;
    return messageCount > 1
      ? `${actorName} sent you ${messageCount} new messages`
      : `${actorName} sent you a new message`;
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="border-[0.5px] border-gray-200 rounded-lg bg-white overflow-hidden cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={() => onClick(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(item);
      }}
    >
      <div className="px-3 py-3 flex gap-2.5">
        {/* Actor Avatar for message notifications - larger, on the left */}
        {isChatNotification && actorName && (
          <div
            className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center font-semibold text-white text-xs overflow-hidden bg-gradient-to-br from-[#3CCED7] to-[#A6E661]"
            title={actorName}
          >
            {item.actor_avatar ? (
              <img src={item.actor_avatar} alt={actorName} className="w-full h-full object-cover" />
            ) : (
              actorName.charAt(0).toUpperCase()
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-2">
            {/* Title - bold */}
            <p className="min-w-0 text-[13px] leading-snug font-bold text-gray-900">
              {isChatNotification ? getMessageTitleText() : item.title}
            </p>
            {!item.is_read && (
              showMessageCount ? (
                // Red count badge for chat notifications with multiple messages
                <span
                  className="mt-0.5 min-w-[18px] h-[18px] px-1 shrink-0 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center"
                  aria-label={`${messageCount} unread messages`}
                >
                  {messageCount > 99 ? '99+' : messageCount}
                </span>
              ) : (
                // Blue dot for other unread notifications
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden />
              )
            )}
          </div>
          {/* Body: SVO description for non-message, plain body for message */}
          {isChatNotification ? (
            item.body ? (
              <p className="mt-0.5 text-[12px] text-gray-500 line-clamp-1">{item.body}</p>
            ) : null
          ) : svoDescription ? (
            <p className="mt-0.5 text-[12px] text-gray-500 line-clamp-1">{svoDescription}</p>
          ) : null}
          <p className="mt-1.5 text-[11px] text-gray-400">
            {formatRelativeTime(item.created_at)}
          </p>
        </div>
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
  const { lastRefresh, setUnreadCount: setGlobalUnreadCount, triggerRefresh } = useNotificationStore();
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
      triggerRefresh();
    } catch {
      // non-critical
    }
  };

  // Clear all notifications
  const handleClearAll = async () => {
    if (items.length === 0) return;
    try {
      await notificationsApi.clear({ scope: 'all' });
      await fetchNotifications(tab);
      triggerRefresh();
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
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => void handleMarkAllRead()}
                disabled={loading || unreadCount === 0}
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40 transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => void handleClearAll()}
                disabled={loading || items.length === 0}
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40 transition-colors"
                title="Clear all notifications"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <Link
                href="/notifications/preferences"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                title="Notification preferences"
              >
                <Settings className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* ── Tab filters ── */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100">
            {TABS.map((t) => {
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3CCED7]/40 ${
                    active
                      ? 'bg-gradient-to-r from-[#3CCED7] to-[#A6E661] text-white shadow-sm'
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
