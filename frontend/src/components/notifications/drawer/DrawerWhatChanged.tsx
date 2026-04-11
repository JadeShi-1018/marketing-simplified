"use client";

import React from "react";
import {
  Clock,
  Users,
  FileText,
  MapPin,
  Type,
  Paperclip,
  MessageCircle,
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

// Check if this notification type supports "What Changed" section
export function hasWhatChanged(notification: NotificationItem): boolean {
  const { event_type, metadata } = notification;

  // Task status changes
  if (event_type === "task_status_changed") {
    return !!(metadata?.old_status && metadata?.new_status);
  }

  // Meeting updates - always show for meeting-related events
  if (
    event_type === "meeting_updated" ||
    event_type === "meeting_agenda_changed" ||
    event_type === "meeting_participant_added" ||
    event_type === "meeting_participant_removed"
  ) {
    return true;
  }

  // New chat session — show when metadata has sender or title (matches backend contract)
  if (event_type === "chat_new_conversation") {
    return !!(
      metadata?.sender_name ||
      metadata?.conversation_title ||
      metadata?.first_message
    );
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
    metadata?.removed_artifacts
  );
}

// Generic Change Card component for Before/After display
function ChangeCard({
  icon: Icon,
  label,
  beforeValue,
  afterValue,
  isLongText = false,
}: {
  icon: React.ElementType;
  label: string;
  beforeValue: string | null | undefined;
  afterValue: string | null | undefined;
  isLongText?: boolean;
}) {
  // Don't render if no values
  if (!beforeValue && !afterValue) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      {/* Header with icon and label */}
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gray-500" />
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
              className={`text-sm text-green-600 font-medium mt-0.5 ${
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

// Render artifact changes
function ArtifactChanges({ metadata }: { metadata: Record<string, unknown> }) {
  const added = metadata?.added_artifacts as string[] | undefined;
  const removed = metadata?.removed_artifacts as string[] | undefined;

  if ((!added || added.length === 0) && (!removed || removed.length === 0)) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Paperclip className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-800">Artifacts</span>
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
  const oldAgenda = metadata?.old_agenda as string | undefined;
  const newAgenda = metadata?.new_agenda as string | undefined;
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

      {/* Agenda / Document Content Change */}
      <ChangeCard
        icon={FileText}
        label={event_type === "doc_asset_update" ? "Document Content" : "Agenda"}
        beforeValue={oldAgenda}
        afterValue={newAgenda}
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

        {/* Task status change */}
        {event_type === "task_status_changed" && metadata && (
          <TaskStatusChange metadata={metadata} />
        )}

        {event_type === "chat_new_conversation" && (
          <ChatNewConversationSection notification={notification} />
        )}

        {/* Meeting changes + collaborative document / notes */}
        {(event_type === "meeting_updated" ||
          event_type === "meeting_agenda_changed" ||
          event_type === "meeting_participant_added" ||
          event_type === "meeting_participant_removed" ||
          event_type === "doc_asset_update") && (
          <MeetingChangesSection event_type={event_type} metadata={metadata || {}} />
        )}
      </div>
    </div>
  );
}
