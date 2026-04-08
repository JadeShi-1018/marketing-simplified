import { create } from "zustand";

interface NotificationStore {
  /** Global unread count shown in Header bell badge */
  unreadCount: number;
  /** Timestamp of last refresh - used to trigger re-fetches */
  lastRefresh: number;
  /** Set the unread count */
  setUnreadCount: (count: number) => void;
  /** Trigger a refresh across all notification consumers */
  triggerRefresh: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  unreadCount: 0,
  lastRefresh: Date.now(),
  setUnreadCount: (count) => set({ unreadCount: count }),
  triggerRefresh: () => set({ lastRefresh: Date.now() }),
}));
