/** Backend NotificationEventType string values used in UI (keep in sync with notifications.models). */
export const NOTIFICATION_EVENT = {
  CHAT_NEW_MESSAGE: "chat_new_message",
  CHAT_NEW_CONVERSATION: "chat_new_conversation",
  CHAT_MENTION: "chat_mention",
  DOC_ASSET_UPDATE: "doc_asset_update",
} as const;

/** Metadata structure for chat_new_message notifications */
export interface ChatMessageNotificationMetadata {
  chat_id: number;
  message_id: number;
  project_id: number;
  /** Number of unread messages in this chat (for aggregated notifications) */
  message_count?: number;
  /** ID of the last message (when aggregated) */
  last_message_id?: number;
}

/** Metadata structure for chat_new_conversation notifications */
export interface ChatConversationNotificationMetadata {
  chat_id: number;
  project_id: number;
  sender_name: string;
  conversation_title: string;
  chat_type: "private" | "group";
}

/** Union type for chat notification metadata */
export type ChatNotificationMetadata =
  | ChatMessageNotificationMetadata
  | ChatConversationNotificationMetadata;

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
  /** Whether the recipient has already accepted or declined this notification. */
  responded: boolean;
  /** The response value: "accept" | "reject" | "" */
  response: string;
  /** Display name of the actor who triggered this notification (null for system events). */
  actor_name?: string | null;
  /** Absolute URL of the actor's avatar image (null if no avatar). */
  actor_avatar?: string | null;
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
    budget_review: PrefRow;
    budget_pool_low: PrefRow;
    budget_escalation: PrefRow;
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
