"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCheck, Settings, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useNotificationDrawer } from "@/components/notifications/NotificationDrawerProvider";
import { notificationsApi } from "@/lib/api/notificationsApi";
import { useNotificationStore } from "@/lib/notificationStore";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { getModuleBarClass } from "@/lib/notificationVisuals";
import {
  NOTIFICATIONS_FROM_PARAM,
  buildPreferencesHrefFromNotificationsSearch,
  getSafeInternalReturnPath,
} from "@/lib/notificationsNavigation";
import type { NotificationItem, NotificationTab } from "@/types/notifications";
import { NOTIFICATION_EVENT } from "@/types/notifications";

const TABS: { id: NotificationTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mentions", label: "Mentions" },
  { id: "deadlines", label: "Deadlines" },
];

// Notification card component that uses the drawer hook inside Layout's provider
function NotificationCard({
  notification,
  selected,
  onToggle,
  onDelete,
}: {
  notification: NotificationItem;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { openDrawer } = useNotificationDrawer();

  // Check if this is a chat notification with multiple messages
  const isChatNotification = notification.event_type === NOTIFICATION_EVENT.CHAT_NEW_MESSAGE;
  const messageCount = (notification.metadata?.message_count as number) || 1;
  const showMessageCount = isChatNotification && messageCount > 1;

  const handleCardClick = () => {
    openDrawer(notification);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleCardClick();
      }}
      className={`relative overflow-hidden rounded-xl border p-4 flex gap-3 cursor-pointer transition-colors hover:bg-gray-50 ${
        notification.is_read
          ? "bg-white border-gray-200"
          : "bg-white border-blue-200 shadow-sm"
      }`}
    >
      <div
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${getModuleBarClass(notification)}`}
        aria-hidden
      />
      <input
        type="checkbox"
        className="mt-1 rounded border-gray-300"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex-1 min-w-0 pl-1">
        <div className="flex justify-between gap-2">
          <p className="text-base font-bold text-gray-900">{notification.title}</p>
          {!notification.is_read && (
            showMessageCount ? (
              // Red count badge for chat notifications with multiple messages
              <span
                className="min-w-[20px] h-[20px] px-1.5 shrink-0 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center"
                aria-label={`${messageCount} unread messages`}
              >
                {messageCount > 99 ? "99+" : messageCount}
              </span>
            ) : (
              // Blue dot for other unread notifications
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-blue-500 mt-1.5"
                aria-label="Unread"
              />
            )
          )}
        </div>
        {notification.body ? (
          <p className="text-sm text-gray-600 mt-1">{notification.body}</p>
        ) : null}
        <p className="text-xs text-gray-400 mt-2">
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>
      <button
        type="button"
        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors self-start"
        title="Delete notification"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function NotificationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromRaw = searchParams.get(NOTIFICATIONS_FROM_PARAM);
  const { setUnreadCount: setGlobalUnreadCount, triggerRefresh, lastRefresh } =
    useNotificationStore();

  const goBackToWork = () => {
    const target = getSafeInternalReturnPath(fromRaw);
    router.push(target ?? "/");
  };

  const [tab, setTab] = useState<NotificationTab>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [tabCounts, setTabCounts] = useState({
    all: 0,
    unread: 0,
    mentions: 0,
    deadlines: 0,
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await notificationsApi.list({ tab, page_size: 50 });
      setItems(data.results);
      setTabCounts(data.tab_counts);
      setUnreadCount(data.unread_count);
      // Sync global unread count for Header bell
      setGlobalUnreadCount(data.unread_count);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, setGlobalUnreadCount]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch when Header panel triggers a refresh (e.g., mark all read)
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRefresh]);

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const markSelectedRead = async () => {
    if (selected.size === 0) return;
    await notificationsApi.markRead({ ids: Array.from(selected) });
    setSelected(new Set());
    await load();
    triggerRefresh();
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    await notificationsApi.clear({ scope: "ids", ids: Array.from(selected) });
    setSelected(new Set());
    await load();
    triggerRefresh();
  };

  const deleteSingle = async (id: string) => {
    await notificationsApi.clear({ scope: "ids", ids: [id] });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await load();
    triggerRefresh();
  };

  const markAllRead = async () => {
    await notificationsApi.markRead({ mark_all: true });
    setSelected(new Set());
    await load();
    triggerRefresh();
  };

  const clearAll = async () => {
    if (items.length === 0) return;
    await notificationsApi.clear({ scope: "all" });
    setSelected(new Set());
    await load();
    triggerRefresh();
  };

  return (
    <DashboardLayout hideRightPanel>
      <div className="w-full px-6 lg:px-10 py-8">
        <button
          type="button"
          onClick={goBackToWork}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-5 w-5" />
          Back
        </button>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={markAllRead}
              disabled={loading || unreadCount === 0}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
              title="Mark all as read"
            >
              <CheckCheck className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={loading || items.length === 0}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
              title="Clear all notifications"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <Link
              href={buildPreferencesHrefFromNotificationsSearch(fromRaw)}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              title="Notification preferences"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {tabCounts.all} total · {unreadCount} unread
        </p>

        <div className="flex flex-wrap gap-2 mt-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
                tab === t.id
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t.label}{" "}
              <span className="opacity-80">
                (
                {t.id === "all"
                  ? tabCounts.all
                  : t.id === "unread"
                    ? tabCounts.unread
                    : t.id === "mentions"
                      ? tabCounts.mentions
                      : tabCounts.deadlines}
                )
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-4 py-2 border-b border-gray-200">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="rounded border-gray-300"
            />
            Select all
          </label>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={markSelectedRead}
            className="text-sm text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            Mark selected as read
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={deleteSelected}
            className="text-sm text-red-600 hover:underline disabled:opacity-40 disabled:no-underline flex items-center gap-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete selected
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-gray-500 text-sm py-12 text-center">
              No notifications
            </p>
          ) : (
            items.map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                selected={selected.has(n.id)}
                onToggle={() => toggleOne(n.id)}
                onDelete={() => deleteSingle(n.id)}
              />
            ))
          )}
        </div>

        <p className="mt-8">
          <Link
            href={buildPreferencesHrefFromNotificationsSearch(fromRaw)}
            className="text-sm text-blue-600 hover:underline"
          >
            Notification preferences
          </Link>
        </p>
      </div>
    </DashboardLayout>
  );
}

export default function NotificationsPage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <DashboardLayout hideRightPanel>
            <div className="w-full px-6 lg:px-10 py-16 text-gray-500 text-sm">
              Loading...
            </div>
          </DashboardLayout>
        }
      >
        <NotificationsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
