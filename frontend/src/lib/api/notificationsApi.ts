import api from "../api";
import type {
  NotificationTab,
  PaginatedNotifications,
  NotificationPreferencesData,
} from "@/types/notifications";

export const notificationsApi = {
  list: (params?: {
    page?: number;
    page_size?: number;
    category?: string;
    is_read?: boolean;
    tab?: NotificationTab;
  }) =>
    api.get<PaginatedNotifications>("/api/notifications/", { params }),

  markRead: (body: { ids?: string[]; mark_all?: boolean }) =>
    api.patch("/api/notifications/read/", body),

  clear: (body: { scope: "all" | "read" | "ids"; ids?: string[] }) =>
    api.delete("/api/notifications/clear/", { data: body }),

  getPreferences: () =>
    api.get<{ preferences: NotificationPreferencesData; updated_at: string | null }>(
      "/api/notification-preferences/"
    ),

  patchPreferences: (preferencesPatch: Record<string, unknown>) =>
    api.patch<{ preferences: NotificationPreferencesData; updated_at: string | null }>(
      "/api/notification-preferences/",
      { preferences: preferencesPatch }
    ),

  /** Accept or reject an actionable notification (invite / assignment). */
  respond: (notificationId: string, action: "accept" | "reject") =>
    api.post<{ status: string; action: string }>(
      `/api/notifications/${notificationId}/respond/`,
      { action }
    ),
};
