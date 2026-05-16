"use client";

import React from "react";
import {
  Clock,
  Users,
  FileText,
  MapPin,
  Type,
  Paperclip,
  MessageSquare,
  Tag,
  User,
  AlertCircle,
} from "lucide-react";
import type { NotificationItem } from "@/types/notifications";

interface DrawerWhatChangedProps {
  notification: NotificationItem;
}

// Format datetime for display (human-readable format)
function formatDateTime(timeStr: string | undefined | null): string {
  if (!timeStr) return "Not set";
  try {
    // Handle date-only strings (YYYY-MM-DD) vs datetime strings
    const hasTime = timeStr.includes(" ") || timeStr.includes("T");
    if (!hasTime) {
      // Date only - format as "Apr 9, 2026"
      const date = new Date(timeStr + "T00:00:00");
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    // DateTime - format as "Apr 9, 2026 10:00 AM"
    const date = new Date(timeStr.replace(" ", "T"));
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return timeStr;
  }
}

/** Task event types that surface a "What Changed" card (field-level diffs). */
const TASK_EVENT_TYPES = new Set([
  "task_status_changed",
  "task_assigned",
  "task_owner_changed",
]);

// Check if this notification type supports "What Changed" section
export function hasWhatChanged(notification: NotificationItem): boolean {
  const { event_type, metadata } = notification;

  // Task events: show when the backend has emitted a change_type.
  // Legacy task_status_changed also renders with old_status / new_status alone.
  if (TASK_EVENT_TYPES.has(event_type)) {
    return !!(
      metadata?.change_type ||
      (metadata?.old_status && metadata?.new_status)
    );
  }

  // Meeting field changes (title, time, location, agenda, artifacts)
  if (
    event_type === "meeting_updated" ||
    event_type === "meeting_agenda_changed"
  ) {
    return true;
  }

  // Meeting notes / collaborative document (DOC_ASSET_UPDATE)
  if (event_type === "doc_asset_update") {
    return hasMeetingChangeData(metadata || {});
  }

  return false;
}

// Check if meeting has any specific change data
function hasMeetingChangeData(metadata: Record<string, unknown>): boolean {
  return !!(
    metadata?.old_time ||
    metadata?.new_time ||
    metadata?.old_agenda ||
    metadata?.new_agenda ||
    metadata?.old_location ||
    metadata?.new_location ||
    metadata?.old_title ||
    metadata?.new_title ||
    metadata?.added_participants ||
    metadata?.removed_participants ||
    metadata?.added_artifacts ||
    metadata?.removed_artifacts ||
    metadata?.change_type === 'artifact_linked' ||
    metadata?.change_type === 'artifact_unlinked'
  );
}

// Generic Change Card component for Before/After display
function ChangeCard({
  icon: Icon,
  label,
  beforeValue,
  afterValue,
  isLongText = false,
  afterDanger = false,
}: {
  icon: React.ElementType;
  label: string;
  beforeValue: string | null | undefined;
  afterValue: string | null | undefined;
  isLongText?: boolean;
  /** When true the "After" value is rendered in red to indicate a warning state. */
  afterDanger?: boolean;
}) {
  // Don't render if no values
  if (!beforeValue && !afterValue) return null;

  const afterColorClass = afterDanger ? "text-red-600" : "text-green-600";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      {/* Header with icon and label */}
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${afterDanger ? "text-red-500" : "text-gray-500"}`} />
        <span className="text-sm font-semibold text-gray-800">{label}</span>
      </div>

      {/* Before/After content */}
      <div className="space-y-1.5 pl-6">
        {/* Before */}
        {beforeValue && (
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Before:
            </span>
            <p
              className={`text-sm text-gray-400 line-through mt-0.5 ${
                isLongText ? "whitespace-pre-wrap break-words" : ""
              }`}
            >
              {beforeValue}
            </p>
          </div>
        )}

        {/* After */}
        {afterValue && (
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              After:
            </span>
            <p
              className={`text-sm font-medium mt-0.5 ${afterColorClass} ${
                isLongText ? "whitespace-pre-wrap break-words" : ""
              }`}
            >
              {afterValue}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatNewConversationSection({
  notification,
}: {
  notification: NotificationItem;
}) {
  const metadata = notification.metadata || {};
  const senderName = (metadata.sender_name as string) || "Someone";
  const conversationTitle =
    (metadata.conversation_title as string) || "Conversation";
  const firstMessage = (metadata.first_message as string) || "";

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <MessageCircle className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">New conversation</span>
        </div>
        <div className="space-y-2 pl-6">
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Started by
            </span>
            <p className="text-sm text-gray-800 font-medium mt-0.5">{senderName}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Chat
            </span>
            <p className="text-sm text-gray-700 mt-0.5">{conversationTitle}</p>
          </div>
          {firstMessage.trim() ? (
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                First message
              </span>
              <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap break-words">
                {firstMessage.trim()}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Render task status change
function TaskStatusChange({ metadata }: { metadata: Record<string, unknown> }) {
  const oldStatus = (metadata?.old_status as string) || "Unknown";
  const newStatus = (metadata?.new_status as string) || "Unknown";

  const formatStatus = (status: string) =>
    status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <ChangeCard
      icon={FileText}
      label="Status"
      beforeValue={formatStatus(oldStatus)}
      afterValue={formatStatus(newStatus)}
    />
  );
}

// Render participant changes
function ParticipantChanges({ metadata }: { metadata: Record<string, unknown> }) {
  const added = metadata?.added_participants as string[] | undefined;
  const removed = metadata?.removed_participants as string[] | undefined;

  if ((!added || added.length === 0) && (!removed || removed.length === 0)) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-800">Participants</span>
      </div>

      {/* Changes */}
      <div className="space-y-1.5 pl-6">
        {removed && removed.length > 0 && (
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Removed:
            </span>
            <p className="text-sm text-gray-400 line-through mt-0.5">
              {removed.join(", ")}
            </p>
          </div>
        )}
        {added && added.length > 0 && (
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Added:
            </span>
            <p className="text-sm text-green-600 font-medium mt-0.5">
              {added.join(", ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Render artifact changes — supports both new structured metadata and legacy string-array format
function ArtifactChanges({ metadata }: { metadata: Record<string, unknown> }) {
  const changeType = metadata?.change_type as string | undefined;
  const artifactType = metadata?.artifact_type as string | undefined;
  const artifactTitle = metadata?.artifact_title as string | undefined;

  // New structured format from current backend
  if (changeType === 'artifact_linked' || changeType === 'artifact_unlinked') {
    const isLinked = changeType === 'artifact_linked';
    const typeLabel = artifactType
      ? artifactType.charAt(0).toUpperCase() + artifactType.slice(1)
      : 'Artifact';
    const title = artifactTitle || (artifactType ? `${typeLabel} #${metadata?.artifact_id}` : 'Unknown');

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Paperclip className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">{typeLabel}</span>
        </div>
        <div className="pl-6">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {isLinked ? 'Linked:' : 'Removed:'}
          </span>
          <p className={`text-sm font-medium mt-0.5 ${isLinked ? 'text-green-600' : 'text-gray-400 line-through'}`}>
            {title}
          </p>
        </div>
      </div>
    );
  }

  // Legacy format: added_artifacts / removed_artifacts string arrays
  const added = metadata?.added_artifacts as string[] | undefined;
  const removed = metadata?.removed_artifacts as string[] | undefined;
  if ((!added || added.length === 0) && (!removed || removed.length === 0)) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Paperclip className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-800">Artifacts</span>
      </div>
      <div className="space-y-1.5 pl-6">
        {removed && removed.length > 0 && (
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Removed:</span>
            <p className="text-sm text-gray-400 line-through mt-0.5">{removed.join(', ')}</p>
          </div>
        )}
        {added && added.length > 0 && (
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Added:</span>
            <p className="text-sm text-green-600 font-medium mt-0.5">{added.join(', ')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Resolve task change card props from notification metadata.
 *
 * change_type       | icon        | label      | value treatment
 * ------------------|-------------|------------|-------------------------------
 * task_status       | FileText    | Status     | format snake_case → Title Case
 * task_assignee     | User        | Assignee   | display names
 * task_approver     | User        | Approver   | display names
 * task_due_date     | Calendar    | Due Date   | ISO date string
 * task_title        | Type        | Title      | plain text
 * task_priority     | AlertCircle | Priority   | e.g. HIGH → High
 * (legacy fallback) | Tag         | Change     | raw old/new values
 */
function resolveTaskCardProps(metadata: Record<string, unknown>): {
  icon: React.ElementType;
  label: string;
  beforeValue: string | undefined;
  afterValue: string | undefined;
  afterDanger: boolean;
} {
  const changeType = metadata?.change_type as string | undefined;
  const oldVal = (metadata?.old_value ?? metadata?.old_status) as string | null | undefined;
  const newVal = (metadata?.new_value ?? metadata?.new_status) as string | null | undefined;

  const before = oldVal ?? undefined;
  const after  = newVal ?? undefined;

  const formatStatus = (s: string) =>
    s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const formatPriority = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  switch (changeType) {
    case "task_status":
      return {
        icon: FileText,
        label: "Status",
        beforeValue: before ? formatStatus(before) : undefined,
        afterValue:  after  ? formatStatus(after)  : undefined,
        afterDanger: false,
      };
    case "task_overdue":
      return {
        icon: AlertCircle,
        label: "Status",
        beforeValue: before,
        afterValue:  after ?? "Overdue",
        afterDanger: true,
      };
    case "task_assignee":
      return { icon: User, label: "Assignee", beforeValue: before, afterValue: after, afterDanger: false };
    case "task_approver":
      return { icon: User, label: "Approver", beforeValue: before, afterValue: after, afterDanger: false };
    case "task_due_date":
      return { icon: Calendar, label: "Due Date", beforeValue: before, afterValue: after, afterDanger: false };
    case "task_title":
      return { icon: Type, label: "Title", beforeValue: before, afterValue: after, afterDanger: false };
    case "task_priority":
      return {
        icon: AlertCircle,
        label: "Priority",
        beforeValue: before ? formatPriority(before) : undefined,
        afterValue:  after  ? formatPriority(after)  : undefined,
        afterDanger: false,
      };
    case "task_anomaly":
      return {
        icon: AlertCircle,
        label: "Anomaly",
        beforeValue: before ? formatStatus(before) : "Normal",
        afterValue:  after  ? formatStatus(after)  : "Anomaly Detected",
        afterDanger: true,
      };
    default:
      // Legacy task_status_changed that only has old_status / new_status
      if (metadata?.old_status || metadata?.new_status) {
        const os = metadata.old_status as string | undefined;
        const ns = metadata.new_status as string | undefined;
        return {
          icon: FileText,
          label: "Status",
          beforeValue: os ? formatStatus(os) : undefined,
          afterValue:  ns ? formatStatus(ns) : undefined,
          afterDanger: false,
        };
      }
      return { icon: Tag, label: "Change", beforeValue: before, afterValue: after, afterDanger: false };
  }
}

// Render a single task change card.
function TaskChangesSection({ metadata }: { metadata: Record<string, unknown> }) {
  const { icon, label, beforeValue, afterValue, afterDanger } = resolveTaskCardProps(metadata);

  if (!beforeValue && !afterValue) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
        <p className="text-sm text-gray-600">Task details were updated.</p>
        <p className="text-xs text-gray-400 mt-1 italic">
          (Detailed change information not available for this notification)
        </p>
      </div>
    );
  }

  return (
    <ChangeCard
      icon={icon}
      label={label}
      beforeValue={beforeValue}
      afterValue={afterValue}
      afterDanger={afterDanger}
    />
  );
}

// Comment mention — shows the excerpt where the user was @mentioned
function CommentMentionSection({ metadata }: { metadata: Record<string, unknown> }) {
  const excerpt = metadata?.comment_excerpt as string | undefined;
  if (!excerpt) return null;
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-800">Comment</span>
      </div>
      <p className="text-sm text-gray-700 pl-6 leading-relaxed italic">
        &ldquo;{excerpt.length > 200 ? excerpt.slice(0, 200) + "…" : excerpt}&rdquo;
      </p>
    </div>
  );
}

// Meeting minutes published — simple confirmation card
function MinutesPublishedSection() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold text-gray-800">Minutes Published</span>
      </div>
      <p className="text-sm text-gray-600 pl-6 mt-1">
        The official meeting minutes are now available.
      </p>
    </div>
  );
}

// ── System alert sections ─────────────────────────────────────────────────────

/** Shows calendar event title + scheduled time for CALENDAR_REMINDER. */
function CalendarReminderSection({
  metadata,
}: {
  metadata: Record<string, unknown>;
}) {
  const eventTitle = (metadata.event_title as string) || "Upcoming event";
  const startTimeRaw = metadata.start_time as string | null | undefined;

  let startTimeLabel = startTimeRaw ?? "";
  if (startTimeRaw) {
    try {
      startTimeLabel = new Date(startTimeRaw).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      // keep raw value if parsing fails
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold text-gray-800">Event</span>
      </div>
      <div className="space-y-1.5 pl-6">
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Title
          </span>
          <p className="text-sm text-gray-800 font-medium mt-0.5">{eventTitle}</p>
        </div>
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

/** Shows the stale-approval message for DECISION_DEADLINE. */
function DecisionDeadlineSection({
  metadata,
}: {
  metadata: Record<string, unknown>;
}) {
  const decisionTitle = (metadata.decision_title as string) || "Decision";
  const message =
    (metadata.new_value as string) || "Awaiting approval";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Hourglass className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-gray-800">Deadline</span>
      </div>
      <div className="space-y-1.5 pl-6">
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Decision
          </span>
          <p className="text-sm text-gray-800 font-medium mt-0.5">{decisionTitle}</p>
        </div>
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

/** Shows how soon the meeting starts for MEETING_STARTING_SOON. */
function MeetingStartingSoonSection({
  metadata,
}: {
  metadata: Record<string, unknown>;
}) {
  const meetingTitle = (metadata.meeting_title as string) || "Meeting";
  const startLabel = (metadata.start_time as string) || "";
  const startExact = (metadata.start_time_exact as string) || "";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-semibold text-gray-800">Starts In</span>
      </div>
      <div className="space-y-1.5 pl-6">
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Meeting
          </span>
          <p className="text-sm text-gray-800 font-medium mt-0.5">{meetingTitle}</p>
        </div>
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

/**
 * Resolve the agenda change card label and display values from notification metadata.
 *
 * change_type          | label          | value treatment
 * ---------------------|----------------|------------------------------------------
 * agenda_item          | "Item"         | raw old/new item content (edit)
 * agenda_item_create   | "Item Created" | new_agenda only
 * agenda_item_delete   | "Item Deleted" | old_agenda only
 * agenda_section       | "Section"      | title (strips legacy "Section: " prefix)
 * (legacy / none)      | "Agenda"       | backward-compat
 */
function resolveAgendaCardProps(
  event_type: string,
  metadata: Record<string, unknown>,
): { label: string; beforeValue: string | undefined; afterValue: string | undefined } {
  const raw_old = metadata?.old_agenda as string | undefined;
  const raw_new = metadata?.new_agenda as string | undefined;
  const changeType = metadata?.change_type as string | undefined;

  if (event_type === "doc_asset_update") {
    return { label: "Document Content", beforeValue: raw_old, afterValue: raw_new };
  }

  if (changeType === "agenda_item") {
    return { label: "Item", beforeValue: raw_old, afterValue: raw_new };
  }

  if (changeType === "agenda_item_create") {
    // Only an "after" value — no prior content exists.
    return { label: "Item Created", beforeValue: undefined, afterValue: raw_new };
  }

  if (changeType === "agenda_item_delete") {
    // Only a "before" value — the item no longer exists.
    return { label: "Item Deleted", beforeValue: raw_old, afterValue: undefined };
  }

  if (changeType === "agenda_section") {
    // Strip the legacy "Section: " prefix that older notifications may include.
    const strip = (v: string | undefined) =>
      v?.startsWith("Section: ") ? v.slice("Section: ".length) : v;
    return { label: "Section", beforeValue: strip(raw_old), afterValue: strip(raw_new) };
  }

  // Backward-compat: legacy notifications stored "Section: <title>" in old_agenda.
  if (raw_old?.startsWith("Section: ") || raw_new?.startsWith("Section: ")) {
    const strip = (v: string | undefined) =>
      v?.startsWith("Section: ") ? v.slice("Section: ".length) : v;
    return { label: "Section", beforeValue: strip(raw_old), afterValue: strip(raw_new) };
  }

  return { label: "Agenda", beforeValue: raw_old, afterValue: raw_new };
}

// Meeting changes section
function MeetingChangesSection({
  event_type,
  metadata,
}: {
  event_type: string;
  metadata: Record<string, unknown>;
}) {
  const oldTitle = metadata?.old_title as string | undefined;
  const newTitle = metadata?.new_title as string | undefined;
  const oldTime = metadata?.old_time as string | undefined;
  const newTime = metadata?.new_time as string | undefined;
  const oldLocation = metadata?.old_location as string | undefined;
  const newLocation = metadata?.new_location as string | undefined;

  const hasSpecificChanges = hasMeetingChangeData(metadata);

  // If no specific change data, show fallback message
  if (!hasSpecificChanges) {
    let fallbackMessage = "Meeting details were updated.";
    if (event_type === "meeting_agenda_changed") {
      fallbackMessage = "The meeting agenda was modified.";
    } else if (event_type === "meeting_participant_added") {
      fallbackMessage = "A participant was added to the meeting.";
    } else if (event_type === "meeting_participant_removed") {
      fallbackMessage = "A participant was removed from the meeting.";
    } else if (event_type === "doc_asset_update") {
      fallbackMessage = "Meeting notes or a shared document was updated.";
    }

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
        <p className="text-sm text-gray-600">{fallbackMessage}</p>
        <p className="text-xs text-gray-400 mt-1 italic">
          (Detailed change information not available for this notification)
        </p>
      </div>
    );
  }

  const agendaCard = resolveAgendaCardProps(event_type, metadata);

  return (
    <div className="space-y-3">
      {/* Title Change — hidden for doc_asset_update when title is unchanged */}
      <ChangeCard
        icon={Type}
        label="Title"
        beforeValue={event_type === "doc_asset_update" && oldTitle === newTitle ? undefined : oldTitle}
        afterValue={event_type === "doc_asset_update" && oldTitle === newTitle ? undefined : newTitle}
      />

      {/* Time Change */}
      <ChangeCard
        icon={Clock}
        label="Scheduled Time"
        beforeValue={oldTime ? formatDateTime(oldTime) : undefined}
        afterValue={newTime ? formatDateTime(newTime) : undefined}
      />

      {/* Agenda / Section / Item Content Change */}
      <ChangeCard
        icon={FileText}
        label={agendaCard.label}
        beforeValue={agendaCard.beforeValue}
        afterValue={agendaCard.afterValue}
        isLongText={true}
      />

      {/* Location Change */}
      <ChangeCard
        icon={MapPin}
        label="Location"
        beforeValue={oldLocation}
        afterValue={newLocation}
      />

      {/* Participant Changes */}
      <ParticipantChanges metadata={metadata} />

      {/* Artifact Changes */}
      <ArtifactChanges metadata={metadata} />
    </div>
  );
}

export default function DrawerWhatChanged({ notification }: DrawerWhatChangedProps) {
  const { event_type, metadata } = notification;

  if (!hasWhatChanged(notification)) {
    return null;
  }

  return (
    <div className="px-5 py-4 border-t border-gray-100">
      <div className="rounded-lg bg-orange-50 border border-orange-200 p-4">
        <div className="text-xs font-semibold text-orange-800 uppercase tracking-wide mb-3">
          What Changed
        </div>

        {/* Task changes (status, assignee, due date, title, priority …) */}
        {TASK_EVENT_TYPES.has(event_type) && metadata && (
          <TaskChangesSection metadata={metadata} />
        )}

        {/* Meeting field changes + collaborative document / notes */}
        {(event_type === "meeting_updated" ||
          event_type === "meeting_agenda_changed" ||
          event_type === "doc_asset_update") && (
          <MeetingChangesSection event_type={event_type} metadata={metadata || {}} />
        )}
      </div>
    </div>
  );
}
