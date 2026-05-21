"use client";

import React from "react";
import {
  Bell,
  MessageCircle,
  MessageSquare,
  Calendar,
  Clock,
  AlertCircle,
  FileText,
  Users,
  Hourglass,
  Check,
  X,
  ShieldAlert,
  Zap,
  UserMinus,
  Briefcase,
} from "lucide-react";
import type { NotificationItem } from "@/types/notifications";
import { isInviteNotification } from "./DrawerInviteCard";
import DrawerSectionDivider from "./DrawerSectionDivider";

// ── Which event_types render a notification card ──────────────────────────────

const NOTIFICATION_EVENT_TYPES = new Set([
  "task_comment_mention",
  "task_anomaly",
  "task_deadline_soon",
  "task_overdue",
  "meeting_created",
  "meeting_participant_removed",
  "meeting_starting_soon",
  "meeting_minutes_published",
  "decision_deadline",
  "decision_published",
  "decision_review_needed",
  "budget_approval_result",
  "chat_new_message",
  "chat_new_conversation",
  "calendar_reminder",
  "billing_anomaly",
  "account_permission",
  "workflow_node",
  "system",
]);

export function isNotificationCard(notification: NotificationItem): boolean {
  if (isInviteNotification(notification)) return false;
  if (notification.metadata?.is_response_feedback) return true;
  return NOTIFICATION_EVENT_TYPES.has(notification.event_type);
}

// ── Shared info row ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </span>
      <p className="text-sm text-gray-800 font-medium mt-0.5">{value}</p>
    </div>
  );
}

// ── Section components ────────────────────────────────────────────────────────

/** [actor] accepted / declined your invitation */
function ResponseFeedbackSection({ notification }: { notification: NotificationItem }) {
  const actorName =
    notification.actor_name ||
    (notification.metadata?.actor_name as string) ||
    "Someone";
  const actorAvatar = notification.actor_avatar;
  const action = notification.metadata?.response_action as string | undefined;
  const accepted = action === "accept" || notification.title?.toLowerCase().includes("accept");

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
        accepted
          ? "bg-green-50 text-green-700 border border-green-200"
          : "bg-red-50 text-red-700 border border-red-200"
      }`}
    >
      {accepted ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 align-middle">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3CCED7] to-[#A6E661] text-[10px] font-semibold text-white overflow-hidden">
            {actorAvatar ? (
              <img src={actorAvatar} alt={actorName} className="w-full h-full object-cover" />
            ) : (
              actorName.charAt(0).toUpperCase()
            )}
          </span>
          <span className="font-semibold">{actorName}</span>
        </span>
        <span>{accepted ? "accepted" : "declined"} your invitation</span>
      </span>
    </div>
  );
}

/** Comment excerpt for task_comment_mention */
function CommentMentionSection({ metadata }: { metadata: Record<string, unknown> }) {
  const excerpt = metadata?.comment_excerpt as string | undefined;
  if (!excerpt) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-800">Comment</span>
      </div>
      <p className="text-sm text-gray-700 pl-6 leading-relaxed italic">
        &ldquo;{excerpt.length > 200 ? excerpt.slice(0, 200) + "…" : excerpt}&rdquo;
      </p>
    </div>
  );
}

/** task_anomaly — system detected anomaly */
function TaskAnomalySection({ metadata }: { metadata: Record<string, unknown> }) {
  const detail = (metadata?.anomaly_detail as string) || (metadata?.new_value as string) || "Anomaly detected";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-red-500" />
        <span className="text-sm font-semibold text-gray-800">Anomaly Alert</span>
      </div>
      <p className="text-sm text-red-600 font-medium pl-6">{detail}</p>
    </div>
  );
}

/** task_deadline_soon / task_overdue */
function TaskDeadlineSection({
  event_type,
  metadata,
}: {
  event_type: string;
  metadata: Record<string, unknown>;
}) {
  const dueDate = metadata?.due_date as string | undefined;
  const isOverdue = event_type === "task_overdue";

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Clock className={`w-4 h-4 ${isOverdue ? "text-red-500" : "text-amber-500"}`} />
        <span className="text-sm font-semibold text-gray-800">
          {isOverdue ? "Overdue" : "Deadline Approaching"}
        </span>
      </div>
      {dueDate && (
        <p className={`text-sm font-medium pl-6 ${isOverdue ? "text-red-600" : "text-amber-600"}`}>
          Due: {new Date(dueDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>
      )}
    </div>
  );
}

/** meeting_starting_soon */
function MeetingStartingSoonSection({ metadata }: { metadata: Record<string, unknown> }) {
  const meetingTitle = (metadata?.meeting_title as string) || "";
  const startLabel = (metadata?.start_time as string) || "";
  const startExact = (metadata?.start_time_exact as string) || "";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-semibold text-gray-800">Starts In</span>
      </div>
      <div className="pl-6 space-y-1.5">
        {meetingTitle && <InfoRow label="Meeting" value={meetingTitle} />}
        {(startLabel || startExact) && (
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Scheduled
            </span>
            <p className="text-sm text-indigo-600 font-medium mt-0.5">
              {startExact ? `${startExact} (${startLabel})` : startLabel}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** meeting_minutes_published */
function MinutesPublishedSection() {
  return (
    <div className="flex items-center gap-2">
      <FileText className="w-4 h-4 text-blue-500" />
      <p className="text-sm text-gray-700">
        The official meeting minutes are now available.
      </p>
    </div>
  );
}

/** meeting_participant_removed */
function MeetingRemovedSection({ metadata }: { metadata: Record<string, unknown> }) {
  const meetingTitle = (metadata?.meeting_title as string) || "";
  return (
    <div className="flex items-start gap-2">
      <UserMinus className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-gray-800">Removed from meeting</p>
        {meetingTitle && (
          <p className="text-sm text-gray-600 mt-0.5">{meetingTitle}</p>
        )}
      </div>
    </div>
  );
}

/** meeting_created */
function MeetingCreatedSection({ metadata }: { metadata: Record<string, unknown> }) {
  const meetingTitle = (metadata?.meeting_title as string) || "";
  return (
    <div className="flex items-start gap-2">
      <Calendar className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-gray-800">New meeting created</p>
        {meetingTitle && (
          <p className="text-sm text-gray-600 mt-0.5">{meetingTitle}</p>
        )}
      </div>
    </div>
  );
}

/** decision_deadline */
function DecisionDeadlineSection({ metadata }: { metadata: Record<string, unknown> }) {
  const decisionTitle = (metadata?.decision_title as string) || "Decision";
  const message = (metadata?.new_value as string) || "Awaiting approval";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Hourglass className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-gray-800">Deadline</span>
      </div>
      <div className="pl-6 space-y-1.5">
        <InfoRow label="Decision" value={decisionTitle} />
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Status
          </span>
          <p className="text-sm text-amber-600 font-medium mt-0.5">{message}</p>
        </div>
      </div>
    </div>
  );
}

/** decision_published */
function DecisionPublishedSection({ metadata }: { metadata: Record<string, unknown> }) {
  const decisionTitle = (metadata?.decision_title as string) || "";
  return (
    <div className="flex items-start gap-2">
      <FileText className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-gray-800">Decision published</p>
        {decisionTitle && (
          <p className="text-sm text-gray-600 mt-0.5">{decisionTitle}</p>
        )}
      </div>
    </div>
  );
}

/** calendar_reminder */
function CalendarReminderSection({ metadata }: { metadata: Record<string, unknown> }) {
  const eventTitle = (metadata?.event_title as string) || "Upcoming event";
  const startTimeRaw = metadata?.start_time as string | null | undefined;
  let startTimeLabel = startTimeRaw ?? "";
  if (startTimeRaw) {
    try {
      startTimeLabel = new Date(startTimeRaw).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      // keep raw value
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold text-gray-800">Event Reminder</span>
      </div>
      <div className="pl-6 space-y-1.5">
        <InfoRow label="Title" value={eventTitle} />
        {startTimeLabel && (
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Starts At
            </span>
            <p className="text-sm text-blue-600 font-medium mt-0.5">{startTimeLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** chat_new_conversation */
function ChatNewConversationSection({ notification }: { notification: NotificationItem }) {
  const metadata = notification.metadata || {};
  const senderName =
    notification.actor_name || (metadata?.sender_name as string) || "Someone";
  const conversationTitle = (metadata?.conversation_title as string) || "Conversation";
  const firstMessage = (metadata?.first_message as string) || "";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-800">New Conversation</span>
      </div>
      <div className="pl-6 space-y-1.5">
        <InfoRow label="Started by" value={senderName} />
        <InfoRow label="Chat" value={conversationTitle} />
        {firstMessage.trim() && (
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              First message
            </span>
            <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap break-words">
              {firstMessage.trim()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** chat_new_message — show preview if available */
function ChatMessageSection({ notification }: { notification: NotificationItem }) {
  const preview =
    (notification.metadata?.message_preview as string) || notification.body || "";
  if (!preview) return null;
  return (
    <div className="flex items-start gap-2">
      <MessageSquare className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-gray-800">Message</p>
        <p className="text-sm text-gray-600 mt-0.5 break-words line-clamp-3">{preview}</p>
      </div>
    </div>
  );
}

/** account_permission — project_owner_transferred */
function ProjectOwnerTransferredSection({ notification }: { notification: NotificationItem }) {
  const projectName = notification.metadata?.project_name as string | undefined;
  const previousOwner = notification.metadata?.previous_owner as string | undefined;
  const actorName = notification.actor_name || null;
  const actorAvatar = notification.actor_avatar || null;

  return (
    <div className="flex items-start gap-2">
      <Briefcase className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
      <div className="space-y-2">
        <p className="text-sm text-gray-700 leading-relaxed">
          {actorName ? (
            <span className="inline-flex items-center gap-1 align-middle mr-1">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3CCED7] to-[#A6E661] text-[10px] font-semibold text-white overflow-hidden">
                {actorAvatar ? (
                  <img src={actorAvatar} alt={actorName} className="w-full h-full object-cover" />
                ) : (
                  actorName.charAt(0).toUpperCase()
                )}
              </span>
              <span className="font-semibold text-gray-900">{actorName}</span>
            </span>
          ) : null}
          transferred ownership of{" "}
          {projectName ? (
            <span className="font-semibold text-gray-900">{projectName}</span>
          ) : (
            "this project"
          )}{" "}
          to you. You are now the project owner.
        </p>
        {previousOwner ? (
          <InfoRow label="Previous owner" value={previousOwner} />
        ) : null}
      </div>
    </div>
  );
}

/** account_permission — removed_from_project */
function ProjectMemberRemovedSection({ notification }: { notification: NotificationItem }) {
  const projectName = notification.metadata?.project_name as string | undefined;
  const actorName = notification.actor_name || null;
  const actorAvatar = notification.actor_avatar || null;

  return (
    <div className="flex items-start gap-2">
      <UserMinus className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
      <p className="text-sm text-gray-700 leading-relaxed">
        {actorName ? (
          <span className="inline-flex items-center gap-1 align-middle mr-1">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3CCED7] to-[#A6E661] text-[10px] font-semibold text-white overflow-hidden">
              {actorAvatar ? (
                <img src={actorAvatar} alt={actorName} className="w-full h-full object-cover" />
              ) : (
                actorName.charAt(0).toUpperCase()
              )}
            </span>
            <span className="font-semibold text-gray-900">{actorName}</span>
          </span>
        ) : null}
        removed you from{" "}
        {projectName ? (
          <span className="font-semibold text-gray-900">{projectName}</span>
        ) : (
          "the project"
        )}
      </p>
    </div>
  );
}

/** billing_anomaly / account_permission / workflow_node / system / generic */
function GenericNotificationSection({
  notification,
}: {
  notification: NotificationItem;
}) {
  const iconMap: Record<string, React.ElementType> = {
    billing_anomaly: ShieldAlert,
    account_permission: ShieldAlert,
    workflow_node: Zap,
    system: Bell,
  };
  const colorMap: Record<string, string> = {
    billing_anomaly: "text-red-500",
    account_permission: "text-amber-500",
    workflow_node: "text-indigo-500",
    system: "text-gray-500",
  };
  const Icon = iconMap[notification.event_type] ?? Bell;
  const color = colorMap[notification.event_type] ?? "text-gray-500";
  const text = notification.body || notification.title;

  return (
    <div className="flex items-start gap-2">
      <Icon className={`w-4 h-4 ${color} mt-0.5 shrink-0`} />
      <p className="text-sm text-gray-700">{text}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DrawerNotificationCardProps {
  notification: NotificationItem;
}

export default function DrawerNotificationCard({
  notification,
}: DrawerNotificationCardProps) {
  const { event_type, metadata } = notification;
  const meta = (metadata || {}) as Record<string, unknown>;

  const renderContent = () => {
    // Response feedback: someone accepted/declined the current user's invite
    if (meta?.is_response_feedback) {
      return <ResponseFeedbackSection notification={notification} />;
    }

    switch (event_type) {
      case "task_comment_mention":
        return <CommentMentionSection metadata={meta} />;
      case "task_anomaly":
        return <TaskAnomalySection metadata={meta} />;
      case "task_deadline_soon":
      case "task_overdue":
        return <TaskDeadlineSection event_type={event_type} metadata={meta} />;
      case "meeting_created":
        return <MeetingCreatedSection metadata={meta} />;
      case "meeting_participant_removed":
        return <MeetingRemovedSection metadata={meta} />;
      case "meeting_starting_soon":
        return <MeetingStartingSoonSection metadata={meta} />;
      case "meeting_minutes_published":
        return <MinutesPublishedSection />;
      case "decision_deadline":
        return <DecisionDeadlineSection metadata={meta} />;
      case "decision_published":
        return <DecisionPublishedSection metadata={meta} />;
      case "chat_new_conversation":
        return <ChatNewConversationSection notification={notification} />;
      case "chat_new_message":
        return <ChatMessageSection notification={notification} />;
      case "calendar_reminder":
        return <CalendarReminderSection metadata={meta} />;
      case "account_permission":
        if (meta?.action === "removed_from_project") {
          return <ProjectMemberRemovedSection notification={notification} />;
        }
        if (meta?.action === "project_owner_transferred") {
          return <ProjectOwnerTransferredSection notification={notification} />;
        }
        return <GenericNotificationSection notification={notification} />;
      default:
        return <GenericNotificationSection notification={notification} />;
    }
  };

  const content = renderContent();
  if (!content) return null;

  return (
    <>
      <DrawerSectionDivider />
      <div className="px-5 py-4">
      {/* Drawer section heading — blend ~midpoint between brand teal #3CCED7 and lime #A6E661 → #71DA9C */}
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#71DA9C]">
        Details
      </div>
      <div className="rounded-lg border border-[#3CCED7]/25 bg-gradient-to-r from-[#3CCED7]/8 to-[#A6E661]/8 p-4">
        <div className="space-y-3">{content}</div>
      </div>
    </div>
    </>
  );
}
