"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Trash2, Building2 } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useNotificationDrawer } from "@/components/notifications/NotificationDrawerProvider";
import { notificationsApi } from "@/lib/api/notificationsApi";
import { useNotificationStore } from "@/lib/notificationStore";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import {
  NOTIFICATIONS_FROM_PARAM,
  buildPreferencesHrefFromNotificationsSearch,
} from "@/lib/notificationsNavigation";
import type { NotificationItem, NotificationTab } from "@/types/notifications";
import { NOTIFICATION_EVENT } from "@/types/notifications";
import CsmAPI from "@/lib/api/csmApi";
import type { CsmNotification } from "@/types/csm";

// CSM notifications live in their own store and stay separate from the platform
// feed, so the CSM tab is handled apart from the platform tabs below.
type TabId = NotificationTab | "csm";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mentions", label: "Mentions" },
  { id: "deadlines", label: "Deadlines" },
  { id: "csm", label: "CSM" },
];

// Actor avatar component with brand gradient fallback
function ActorAvatar({
  name,
  avatar,
  size = "md",
}: {
  name: string;
  avatar?: string | null;
  size?: "sm" | "md";
}) {
  const sizeClasses = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <div
      className={`${sizeClasses} shrink-0 rounded-full flex items-center justify-center font-semibold text-white overflow-hidden bg-gradient-to-br from-[#3CCED7] to-[#A6E661]`}
      title={name}
    >
      {avatar ? (
        <img src={avatar} alt={name} className="w-full h-full object-cover" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

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
  const isChatNotification =
    notification.event_type === NOTIFICATION_EVENT.CHAT_NEW_MESSAGE ||
    notification.event_type === NOTIFICATION_EVENT.CHAT_NEW_CONVERSATION;
  const messageCount = (notification.metadata?.message_count as number) || 1;
  const showMessageCount =
    notification.event_type === NOTIFICATION_EVENT.CHAT_NEW_MESSAGE && messageCount > 1;

  // For non-message notifications, show actor avatar and SVO-style header
  const showActorIdentity = !isChatNotification && notification.actor_name;

  // For message notifications, get actor info
  const actorName = notification.actor_name || (notification.metadata?.actor_name as string) || null;

  // Build message title text
  const getMessageTitleText = () => {
    if (!actorName) return notification.title;
    return messageCount > 1
      ? `${actorName} sent you ${messageCount} new messages`
      : `${actorName} sent you a new message`;
  };

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
      className={`overflow-hidden rounded-xl border p-4 flex gap-3 cursor-pointer transition-colors hover:bg-gray-50 ${
        notification.is_read
          ? "bg-white border-gray-200"
          : "bg-white border-blue-200 shadow-sm"
      }`}
    >
      <input
        type="checkbox"
        className="mt-1 rounded border-gray-300"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Actor Avatar - for message notifications (larger) or non-message notifications */}
      {isChatNotification && actorName ? (
        <div
          className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center font-semibold text-white text-sm overflow-hidden bg-gradient-to-br from-[#3CCED7] to-[#A6E661]"
          title={actorName}
        >
          {notification.actor_avatar ? (
            <img src={notification.actor_avatar} alt={actorName} className="w-full h-full object-cover" />
          ) : (
            actorName.charAt(0).toUpperCase()
          )}
        </div>
      ) : showActorIdentity ? (
        <ActorAvatar
          name={notification.actor_name!}
          avatar={notification.actor_avatar}
          size="md"
        />
      ) : null}

      <div className="flex-1 min-w-0">
        <div className="flex justify-between gap-2">
          {/* Title with SVO structure */}
          {isChatNotification ? (
            <p className="text-base font-bold text-gray-900 leading-tight flex-1 min-w-0">
              {getMessageTitleText()}
            </p>
          ) : showActorIdentity ? (
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-gray-900 leading-tight">
                {notification.title}
              </p>
              <p className="text-sm text-gray-600 mt-0.5">
                by <span className="font-medium text-gray-700">{notification.actor_name}</span>
              </p>
            </div>
          ) : (
            <p className="text-base font-bold text-gray-900">{notification.title}</p>
          )}
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
        {notification.body && !showActorIdentity && !isChatNotification ? (
          <p className="text-sm text-gray-600 mt-1">{notification.body}</p>
        ) : notification.body && (showActorIdentity || isChatNotification) ? (
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{notification.body}</p>
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

function CsmNotificationCard({ notification }: { notification: CsmNotification }) {
  return (
    <div
      className={`overflow-hidden rounded-xl border p-4 flex gap-3 ${
        notification.is_read
          ? "bg-white border-gray-200"
          : "bg-white border-blue-200 shadow-sm"
      }`}
    >
      <Building2 className="h-5 w-5 shrink-0 text-indigo-500 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{notification.title}</p>
        {notification.message && (
          <p className="text-sm text-gray-600 mt-0.5">{notification.message}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          {notification.sender_name || notification.sender_email || "System"} ·{" "}
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>
    </div>
  );
}

function NotificationsContent() {
  const searchParams = useSearchParams();
  const fromRaw = searchParams.get(NOTIFICATIONS_FROM_PARAM);
  const { setUnreadCount: setGlobalUnreadCount, triggerRefresh, lastRefresh } =
    useNotificationStore();

  const [tab, setTab] = useState<TabId>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [csmItems, setCsmItems] = useState<CsmNotification[]>([]);
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
      // A user without CSM access just gets an empty CSM tab, so this failing
      // must not stop the platform feed from loading.
      const csm = await CsmAPI.getNotifications().catch(() => [] as CsmNotification[]);
      setCsmItems(csm);
      if (tab !== "csm") {
        const { data } = await notificationsApi.list({ tab, page_size: 50 });
        setItems(data.results);
        setTabCounts(data.tab_counts);
        setUnreadCount(data.unread_count);
        // Sync global unread count for Header bell
        setGlobalUnreadCount(data.unread_count);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, setGlobalUnreadCount]);

  const tabCount = (id: TabId) => {
    switch (id) {
      case "all":
        return tabCounts.all;
      case "unread":
        return tabCounts.unread;
      case "mentions":
        return tabCounts.mentions;
      case "deadlines":
        return tabCounts.deadlines;
      case "csm":
        return csmItems.length;
    }
  };

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

  return (
    <DashboardLayout hideRightPanel>
      <div className="w-full px-6 lg:px-10 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <p className="text-sm text-gray-500 mt-1">
          {tabCounts.all} total · {unreadCount} unread
        </p>

        <div className="flex flex-wrap gap-2 mt-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-1.5 text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3CCED7]/40 ${
                tab === t.id
                  ? "border-transparent bg-gradient-to-r from-[#3CCED7] to-[#A6E661] text-white shadow-sm"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t.label} <span className="opacity-80">({tabCount(t.id)})</span>
            </button>
          ))}
        </div>

        {tab !== "csm" && (
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
        )}

        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : tab === "csm" ? (
            csmItems.length === 0 ? (
              <p className="text-gray-500 text-sm py-12 text-center">
                No CSM notifications
              </p>
            ) : (
              csmItems.map((n) => <CsmNotificationCard key={n.id} notification={n} />)
            )
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
