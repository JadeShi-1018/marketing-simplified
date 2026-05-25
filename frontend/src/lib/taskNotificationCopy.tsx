import type { ReactNode } from "react";
import type { NotificationItem } from "@/types/notifications";

const TASK_FIELD_EDIT_CHANGE_TYPES = new Set([
  "task_due_date",
  "task_title",
  "task_priority",
  "task_status",
]);

/** True when the notification represents a task content field edit (not an invite). */
export function isTaskFieldChangeNotification(notification: NotificationItem): boolean {
  const changeType = notification.metadata?.change_type as string | undefined;
  return !!changeType && TASK_FIELD_EDIT_CHANGE_TYPES.has(changeType);
}

/** True when task_owner_changed is an ownership transfer invite (Accept/Decline). */
export function isTaskOwnershipInviteNotification(notification: NotificationItem): boolean {
  if (notification.event_type !== "task_owner_changed") return false;
  return !isTaskFieldChangeNotification(notification);
}

/** True for user-initiated due date edits (including legacy task_deadline_soon rows). */
export function isTaskDueDateEditNotification(notification: NotificationItem): boolean {
  return notification.metadata?.change_type === "task_due_date";
}

function formatTaskStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getTaskStatusChangeSVODescription(
  notification: NotificationItem,
  actorChip: ReactNode
): ReactNode {
  const metadata = notification.metadata || {};
  const oldStatus = (metadata.old_value ?? metadata.old_status) as string | undefined;
  const newStatus = (metadata.new_value ?? metadata.new_status) as string | undefined;

  if (oldStatus && newStatus) {
    return (
      <>
        {actorChip} changed the status from{" "}
        <span className="font-medium">{formatTaskStatusLabel(oldStatus)}</span> to{" "}
        <span className="font-medium">{formatTaskStatusLabel(newStatus)}</span>.
      </>
    );
  }

  return <>{actorChip} changed the task status.</>;
}

function svoForChangeType(
  changeType: string,
  actor: ReactNode,
  notification?: NotificationItem
): ReactNode {
  switch (changeType) {
    case "task_due_date":
      return <>{actor} updated the task deadline.</>;
    case "task_title":
      return <>{actor} updated the task title.</>;
    case "task_priority":
      return <>{actor} changed the task priority.</>;
    case "task_status":
      return notification
        ? getTaskStatusChangeSVODescription(notification, actor)
        : <>{actor} changed the task status.</>;
    case "task_assignee":
      return <>{actor} changed the task assignee.</>;
    case "task_approver":
      return <>{actor} changed the task approver.</>;
    default:
      return null;
  }
}

/** Panel SVO line under the notification title. */
export function getTaskChangeSVODescription(
  notification: NotificationItem,
  actorChip: ReactNode
): ReactNode | null {
  const changeType = notification.metadata?.change_type as string | undefined;
  if (!changeType) return null;
  return svoForChangeType(changeType, actorChip, notification);
}

/** Drawer Activity Summary description line. */
export function getTaskChangeActivityDescription(
  notification: NotificationItem,
  actor: ReactNode
): ReactNode | null {
  const changeType = notification.metadata?.change_type as string | undefined;
  if (!changeType) return null;
  return svoForChangeType(changeType, actor, notification);
}
