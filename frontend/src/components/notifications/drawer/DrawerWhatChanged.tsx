"use client";

import React from "react";
import { Clock, Users, FileText, MapPin, Calendar } from "lucide-react";
import type { NotificationItem } from "@/types/notifications";

interface DrawerWhatChangedProps {
  notification: NotificationItem;
}

// Format time for display
function formatTime(timeStr: string | undefined | null): string {
  if (!timeStr) return "Not set";
  try {
    return new Date(timeStr).toLocaleString();
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

  // Meeting updates
  if (
    event_type === "meeting_updated" ||
    event_type === "meeting_agenda_changed" ||
    event_type === "meeting_participant_added" ||
    event_type === "meeting_participant_removed"
  ) {
    return !!(
      metadata?.changes ||
      metadata?.old_time ||
      metadata?.new_time ||
      metadata?.old_agenda ||
      metadata?.new_agenda ||
      metadata?.added_participants ||
      metadata?.removed_participants ||
      metadata?.old_location ||
      metadata?.new_location ||
      metadata?.old_title ||
      metadata?.new_title
    );
  }

  return false;
}

// Render task status change
function TaskStatusChange({ metadata }: { metadata: Record<string, unknown> }) {
  const oldStatus = (metadata?.old_status as string) || "Unknown";
  const newStatus = (metadata?.new_status as string) || "Unknown";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-600 w-16">Status:</span>
        <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 text-xs font-medium line-through">
          {oldStatus.replace(/_/g, " ")}
        </span>
        <span className="text-gray-400">&rarr;</span>
        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-medium">
          {newStatus.replace(/_/g, " ")}
        </span>
      </div>
    </div>
  );
}

// Render meeting time change
function MeetingTimeChange({ metadata }: { metadata: Record<string, unknown> }) {
  const oldTime = metadata?.old_time as string | undefined;
  const newTime = metadata?.new_time as string | undefined;

  if (!oldTime && !newTime) return null;

  return (
    <div className="flex items-start gap-3 py-2">
      <Clock className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800">Scheduled Time</div>
        {oldTime && (
          <div className="text-xs text-gray-500 line-through mt-0.5">
            {formatTime(oldTime)}
          </div>
        )}
        {newTime && (
          <div className="text-xs text-green-700 font-medium mt-0.5">
            {formatTime(newTime)}
          </div>
        )}
      </div>
    </div>
  );
}

// Render meeting agenda change
function MeetingAgendaChange({ metadata }: { metadata: Record<string, unknown> }) {
  const oldAgenda = metadata?.old_agenda as string | undefined;
  const newAgenda = metadata?.new_agenda as string | undefined;

  if (!oldAgenda && !newAgenda) return null;

  return (
    <div className="flex items-start gap-3 py-2">
      <FileText className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800">Agenda</div>
        {oldAgenda && (
          <div className="text-xs text-gray-500 line-through mt-1 break-words">
            {oldAgenda.length > 100 ? `${oldAgenda.slice(0, 100)}...` : oldAgenda}
          </div>
        )}
        {newAgenda && (
          <div className="text-xs text-green-700 mt-1 break-words">
            {newAgenda.length > 100 ? `${newAgenda.slice(0, 100)}...` : newAgenda}
          </div>
        )}
      </div>
    </div>
  );
}

// Render meeting location change
function MeetingLocationChange({ metadata }: { metadata: Record<string, unknown> }) {
  const oldLocation = metadata?.old_location as string | undefined;
  const newLocation = metadata?.new_location as string | undefined;

  if (!oldLocation && !newLocation) return null;

  return (
    <div className="flex items-start gap-3 py-2">
      <MapPin className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800">Location</div>
        {oldLocation && (
          <div className="text-xs text-gray-500 line-through mt-0.5">
            {oldLocation}
          </div>
        )}
        {newLocation && (
          <div className="text-xs text-green-700 font-medium mt-0.5">
            {newLocation}
          </div>
        )}
      </div>
    </div>
  );
}

// Render meeting title change
function MeetingTitleChange({ metadata }: { metadata: Record<string, unknown> }) {
  const oldTitle = metadata?.old_title as string | undefined;
  const newTitle = metadata?.new_title as string | undefined;

  if (!oldTitle && !newTitle) return null;

  return (
    <div className="flex items-start gap-3 py-2">
      <FileText className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800">Title</div>
        {oldTitle && (
          <div className="text-xs text-gray-500 line-through mt-0.5">
            {oldTitle}
          </div>
        )}
        {newTitle && (
          <div className="text-xs text-green-700 font-medium mt-0.5">
            {newTitle}
          </div>
        )}
      </div>
    </div>
  );
}

// Render participant changes
function MeetingParticipantChange({ metadata }: { metadata: Record<string, unknown> }) {
  const added = metadata?.added_participants as string[] | undefined;
  const removed = metadata?.removed_participants as string[] | undefined;

  if ((!added || added.length === 0) && (!removed || removed.length === 0)) {
    return null;
  }

  return (
    <div className="flex items-start gap-3 py-2">
      <Users className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800">Participants</div>
        {removed && removed.length > 0 && (
          <div className="mt-1">
            <span className="text-xs text-red-600">Removed: </span>
            <span className="text-xs text-gray-600">{removed.join(", ")}</span>
          </div>
        )}
        {added && added.length > 0 && (
          <div className="mt-1">
            <span className="text-xs text-green-600">Added: </span>
            <span className="text-xs text-gray-600">{added.join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Change field type for generic changes
interface ChangeField {
  before?: string;
  after?: string;
}

// Render generic changes object (for backwards compatibility)
function GenericChanges({ changes }: { changes: Record<string, ChangeField> }) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {entries.map(([field, change]) => {
        const beforeValue = typeof change?.before === "string" ? change.before : "";
        const afterValue = typeof change?.after === "string" ? change.after : "";

        if (!beforeValue && !afterValue) return null;

        return (
          <div key={field} className="flex items-start gap-3 py-2">
            <Calendar className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 capitalize">
                {field.replace(/_/g, " ")}
              </div>
              {beforeValue && (
                <div className="text-xs text-gray-500 line-through mt-0.5">
                  {beforeValue}
                </div>
              )}
              {afterValue && (
                <div className="text-xs text-green-700 font-medium mt-0.5">
                  {afterValue}
                </div>
              )}
            </div>
          </div>
        );
      })}
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

        {/* Meeting changes */}
        {(event_type === "meeting_updated" ||
          event_type === "meeting_agenda_changed" ||
          event_type === "meeting_participant_added" ||
          event_type === "meeting_participant_removed") &&
          metadata && (
            <div className="divide-y divide-orange-100">
              <MeetingTitleChange metadata={metadata} />
              <MeetingTimeChange metadata={metadata} />
              <MeetingAgendaChange metadata={metadata} />
              <MeetingLocationChange metadata={metadata} />
              <MeetingParticipantChange metadata={metadata} />

              {/* Generic changes object fallback */}
              {metadata.changes &&
                typeof metadata.changes === "object" &&
                !Array.isArray(metadata.changes) ? (
                  <GenericChanges
                    changes={metadata.changes as Record<string, ChangeField>}
                  />
                ) : null}
            </div>
          )}
      </div>
    </div>
  );
}
