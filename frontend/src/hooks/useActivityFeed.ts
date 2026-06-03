'use client';

import { useState, useEffect, useCallback } from 'react';
import { notificationsApi } from '@/lib/api/notificationsApi';
import { useNotificationStore } from '@/lib/notificationStore';
import type { NotificationItem } from '@/types/notifications';
import { CHAT_ACTIVITY_EVENT_TYPES } from '@/types/notifications';

export interface ActivityGroup {
  label: string;        // "Today", "Yesterday", "This week", "Earlier"
  items: NotificationItem[];
}

function getGroupLabel(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 1) return 'Today';
  if (diffDays < 2) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  return 'Earlier';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier'];

export function useActivityFeed() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRefresh = useNotificationStore((s) => s.lastRefresh);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await notificationsApi.list({
        category: 'COLLABORATION',
        page_size: 100,
      });
      // Keep only chat-related event types
      const chatItems = data.results.filter((n) =>
        CHAT_ACTIVITY_EVENT_TYPES.has(n.event_type)
      );
      setItems(chatItems);
      // Sync the badge count with actual unread among chat items
      const unreadChatCount = chatItems.filter((n) => !n.is_read).length;
      useNotificationStore.getState().setChatActivityCount(unreadChatCount);
    } catch {
      setError('Could not load activity');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch + refresh whenever SSE triggers a new notification
  useEffect(() => {
    void fetch();
  }, [fetch, lastRefresh]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await notificationsApi.markRead({ ids: [id] });
    } catch {}
    useNotificationStore.getState().triggerRefresh();
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await notificationsApi.markRead({ mark_all: true });
    } catch {}
    useNotificationStore.getState().triggerRefresh();
  }, []);

  const clearRead = useCallback(async () => {
    setItems((prev) => prev.filter((n) => !n.is_read));
    try {
      await notificationsApi.clear({ scope: 'read' });
    } catch {}
  }, []);

  // Group by recency
  const groups: ActivityGroup[] = (() => {
    const map = new Map<string, NotificationItem[]>();
    for (const item of items) {
      const label = getGroupLabel(item.created_at);
      const arr = map.get(label) ?? [];
      arr.push(item);
      map.set(label, arr);
    }
    return GROUP_ORDER.filter((l) => map.has(l)).map((label) => ({
      label,
      items: map.get(label)!,
    }));
  })();

  const unreadCount = items.filter((n) => !n.is_read).length;

  return { groups, isLoading, error, unreadCount, markRead, markAllRead, clearRead, refetch: fetch };
}
