"use client";

import React from "react";
import type { NotificationItem } from "@/types/notifications";

interface DrawerActivitySummaryProps {
  notification: NotificationItem;
}

// Generate a human-readable activity description based on event type
function getActivityDescription(notification: NotificationItem): string {
  const { event_type, metadata, title, body } = notification;
  const actorName = (metadata?.actor_name as string) || "Someone";

  switch (event_type) {
    // Task events
    case "task_assigned":
      return `${actorName} assigned you to this task.`;
    case "task_owner_changed":
      return `Task ownership was transferred to you by ${actorName}.`;
    case "task_status_changed": {
      const oldStatus = (metadata?.old_status as string) || "unknown";
      const newStatus = (metadata?.new_status as string) || "unknown";
      return `Task status changed from ${oldStatus.replace(/_/g, " ")} to ${newStatus.replace(/_/g, " ")}.`;
    }
    case "task_deadline_soon":
      return `This task is due soon. Don't forget to complete it!`;
    case "task_overdue":
      return `This task is now overdue. Please take action.`;
    case "task_comment_mention":
      return `${actorName} mentioned you in a comment.`;
    case "task_anomaly":
      return `An anomaly was detected in this task.`;

    // Meeting events
    case "meeting_created":
      return `${actorName} created a new meeting.`;
    case "meeting_updated":
      return `${actorName} updated the meeting details.`;
    case "meeting_participant_added":
      return `You were added as a participant to this meeting.`;
    case "meeting_participant_removed":
      return `You were removed from this meeting.`;
    case "meeting_starting_soon":
      return `This meeting is starting soon. Be ready to join!`;
    case "meeting_agenda_changed":
      return `${actorName} updated the meeting agenda.`;
    case "meeting_minutes_published":
      return `Meeting minutes have been published.`;

    // Decision events
    case "decision_review_needed":
      return `A decision requires your review.`;
    case "decision_deadline":
      return `Decision deadline is approaching.`;
    case "decision_published":
      return `A decision has been published.`;

    // Chat events
    case "chat_new_message":
      return `${actorName} sent you a message.`;
    case "chat_new_conversation":
      return `${actorName} started a new conversation with you.`;

    // Collaboration events
    case "project_invite":
      return `You've been invited to join a project.`;
    case "calendar_reminder":
      return `Calendar reminder for an upcoming event.`;
    case "doc_asset_update":
      return `A document or asset has been updated.`;

    // Approval events
    case "budget_approval_result":
      return `Budget approval decision has been made.`;
    case "workflow_node":
      return `Workflow automation update.`;
    case "account_permission":
      return `Your account permissions have changed.`;
    case "billing_anomaly":
      return `A billing anomaly was detected.`;

    // System events
    case "system":
      return body || "System notification.";

    default:
      return body || title || "You have a new notification.";
  }
}

// Render chat message bubble for chat notifications
function renderChatBubble(notification: NotificationItem) {
  const { event_type, metadata } = notification;

  if (event_type !== "chat_new_message" && event_type !== "task_comment_mention") {
    return null;
  }

  const senderName = (metadata?.sender_name as string) || (metadata?.actor_name as string) || "Unknown";
  const messagePreview = (metadata?.message_preview as string) || notification.body;

  if (!messagePreview) return null;

  return (
    <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium shrink-0">
          {senderName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900">{senderName}</div>
          <div className="text-sm text-gray-600 mt-0.5 break-words">
            {messagePreview}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DrawerActivitySummary({
  notification,
}: DrawerActivitySummaryProps) {
  const description = getActivityDescription(notification);

  return (
    <div className="px-5 py-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Activity Summary
      </div>

      {/* Main description */}
      <p className="text-base text-gray-900 leading-relaxed">
        {notification.title}
      </p>
      <p className="text-sm text-gray-600 mt-1">{description}</p>

      {/* Chat bubble for message notifications */}
      {renderChatBubble(notification)}
    </div>
  );
}
