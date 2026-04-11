/** Backend NotificationEventType string values used in UI (keep in sync with notifications.models). */
export const NOTIFICATION_EVENT = {
  CHAT_NEW_MESSAGE: "chat_new_message",
  CHAT_NEW_CONVERSATION: "chat_new_conversation",
  DOC_ASSET_UPDATE: "doc_asset_update",
} as const;

export type NotificationTab = "all" | "unread" | "mentions" | "deadlines";

export interface NotificationItem {
  id: string;
  category: string;
  event_type: string;
  related_object_type: string;
  related_object_id: string;
  title: string;
  body: string;
  is_read: boolean;
  action_url: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface NotificationTabCounts {
  all: number;
  unread: number;
  mentions: number;
  deadlines: number;
}

export interface PaginatedNotifications {
  count: number;
  next: string | null;
  previous: string | null;
  results: NotificationItem[];
  unread_count: number;
  tab_counts: NotificationTabCounts;
}

/** Web + Email row toggles */
export type PrefRow = { web: boolean; email: boolean };

/**
 * Matches backend notifications.models.default_notification_preferences()
 */
export interface NotificationPreferencesData {
  disable_all: boolean;
  collaboration_assets: {
    chat_in_app: PrefRow;
    chat_new_session: PrefRow;
    project_invite: PrefRow;
    calendar_reminders: PrefRow;
    doc_asset_updates: PrefRow;
  };
  core_business: {
    meeting_created_updated: PrefRow;
    meeting_participant_assign: PrefRow;
    meeting_starting_soon: PrefRow;
    meeting_agenda_minutes: PrefRow;
    task_assignee: PrefRow;
    task_mention: PrefRow;
    task_deadline: PrefRow;
    task_status: PrefRow;
    task_alert: PrefRow;
    decision_review: PrefRow;
    decision_deadline: PrefRow;
    decision_published: PrefRow;
  };
  automation_system: {
    approval_budget_member: PrefRow;
    workflow_nodes: PrefRow;
    account_security_billing: PrefRow;
  };
  integrations: {
    slack_webhook: PrefRow;
  };
}
