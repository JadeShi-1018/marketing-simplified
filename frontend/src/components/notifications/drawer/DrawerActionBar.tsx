"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Send, ExternalLink, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import type { NotificationItem } from "@/types/notifications";
import { TaskAPI } from "@/lib/api/taskApi";

interface DrawerActionBarProps {
  notification: NotificationItem;
  onActionComplete: () => void;
}

type ActionType = "approval" | "quick_reply" | "default";

/** Event types that previously showed invite-style Accept / Decline — now handled by DrawerInviteCard. */
const INVITE_EVENT_TYPES = new Set([
  "project_invite",
  "meeting_participant_added",
]);

/**
 * Determine the action type for a notification.
 * Invite / assignment types are handled upstream by DrawerInviteCard.
 */
function getActionType(notification: NotificationItem): ActionType {
  const et = notification.event_type;
  const changeType = notification.metadata?.change_type as string | undefined;

  // Response feedback notifications — no action buttons
  if (notification.metadata?.is_response_feedback) return "default";

  // Invite events are handled by DrawerInviteCard — skip here
  if (INVITE_EVENT_TYPES.has(et)) return "default";
  if (et === "task_owner_changed") return "default";
  if (et === "task_assigned" && (changeType === "task_assignee" || changeType === "task_approver")) {
    return "default";
  }

  // Existing task-approval workflow (legacy paths)
  if (
    et === "task_assigned" ||
    et === "decision_review_needed" ||
    et === "budget_approval_result"
  ) {
    return "approval";
  }

  if (
    et === "chat_new_message" ||
    et === "chat_new_conversation" ||
    et === "task_comment_mention"
  ) {
    return "quick_reply";
  }

  return "default";
}

// Approval Actions Component
function ApprovalActions({
  notification,
  onComplete,
}: {
  notification: NotificationItem;
  onComplete: () => void;
}) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  const handleApproval = async (action: "approve" | "reject") => {
    const taskId = parseInt(notification.related_object_id, 10);
    if (isNaN(taskId)) {
      toast.error("Invalid task ID");
      return;
    }

    setLoading(action);
    try {
      await TaskAPI.makeApproval(taskId, { action, comment: "" });
      toast.success(action === "approve" ? "Task approved!" : "Task rejected");
      onComplete();
    } catch (error) {
      console.error("Approval action failed:", error);
      toast.error(`Failed to ${action} task`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => handleApproval("approve")}
        disabled={loading !== null}
        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading === "approve" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Check className="w-4 h-4" />
        )}
        Approve
      </button>
      <button
        type="button"
        onClick={() => handleApproval("reject")}
        disabled={loading !== null}
        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading === "reject" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <X className="w-4 h-4" />
        )}
        Reject
      </button>
    </div>
  );
}

// Quick Reply Component
function QuickReplyAction({
  notification,
  onComplete,
}: {
  notification: NotificationItem;
  onComplete: () => void;
}) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSend = async () => {
    if (!message.trim()) return;

    setLoading(true);
    try {
      // For now, navigate to the chat/comment thread with the message
      // A full implementation would call the chat API directly
      const actionUrl = notification.action_url;
      if (actionUrl) {
        // Navigate to the action URL where user can continue the conversation
        router.push(actionUrl);
        onComplete();
      }
      toast.success("Redirecting to conversation...");
    } catch (error) {
      console.error("Reply failed:", error);
      toast.error("Failed to send reply");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type a quick reply..."
        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={loading || !message.trim()}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

// Build the correct full page URL based on notification type
function buildFullPageUrl(notification: NotificationItem): string | null {
  const { related_object_type, related_object_id, metadata, action_url } = notification;
  const objectType = related_object_type?.toLowerCase();

  // Try multiple sources for project_id
  const taskMeta = metadata?.task as Record<string, unknown> | undefined;
  const meetingMeta = metadata?.meeting as Record<string, unknown> | undefined;
  const projectId =
    (metadata?.project_id as number | string | undefined) ||
    (metadata?.project as number | string | undefined) ||
    (taskMeta?.project_id as number | string | undefined) ||
    (meetingMeta?.project_id as number | string | undefined);

  // Task detail page: /projects/[project_id]/tasks/[task_id]
  if (objectType === "task" && related_object_id) {
    if (projectId) {
      return `/projects/${projectId}/tasks/${related_object_id}`;
    }
    // Try to extract project_id from action_url
    const projectMatch = action_url?.match(/\/projects\/(\d+)/);
    if (projectMatch) {
      return `/projects/${projectMatch[1]}/tasks/${related_object_id}`;
    }
    // Try extracting from task-related patterns in action_url
    const taskMatch = action_url?.match(/\/tasks\/(\d+)/);
    if (taskMatch && action_url) {
      return action_url;
    }
    // Fallback to tasks list with task filter
    return `/tasks?task_id=${related_object_id}`;
  }

  // Meeting workspace page: /projects/[project_id]/meetings/[meeting_id]
  if (objectType === "meeting" && related_object_id) {
    if (projectId) {
      return `/projects/${projectId}/meetings/${related_object_id}`;
    }
    // Try to extract project_id from action_url
    const projectMatch = action_url?.match(/\/projects\/(\d+)/);
    if (projectMatch) {
      return `/projects/${projectMatch[1]}/meetings/${related_object_id}`;
    }
    // Fallback to action_url if provided
    if (action_url) {
      return action_url;
    }
  }

  // Decision page
  if (objectType === "decision" && related_object_id) {
    if (projectId) {
      return `/projects/${projectId}/decisions/${related_object_id}`;
    }
    const projectMatch = action_url?.match(/\/projects\/(\d+)/);
    if (projectMatch) {
      return `/projects/${projectMatch[1]}/decisions/${related_object_id}`;
    }
    // Fallback to action_url if provided
    if (action_url) {
      return action_url;
    }
  }

  // Default fallback to action_url
  return action_url || null;
}

// Go to Full Page Link
function GoToFullPageLink({
  notification,
  onNavigate,
}: {
  notification: NotificationItem;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const fullPageUrl = buildFullPageUrl(notification);

  if (!fullPageUrl) return null;

  const handleClick = () => {
    // Close the drawer first, then navigate
    onNavigate();
    router.push(fullPageUrl);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors"
    >
      <span>Go to Full Page</span>
      <ExternalLink className="w-4 h-4" />
    </button>
  );
}

export default function DrawerActionBar({
  notification,
  onActionComplete,
}: DrawerActionBarProps) {
  const actionType = getActionType(notification);

  return (
    <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 space-y-3 shrink-0">

      {/* ── Existing task-workflow approval ── */}
      {actionType === "approval" && notification.related_object_type === "task" && (
        <ApprovalActions notification={notification} onComplete={onActionComplete} />
      )}

      {/* ── Chat / mention quick reply ── */}
      {actionType === "quick_reply" && (
        <QuickReplyAction notification={notification} onComplete={onActionComplete} />
      )}

      {/* ── Always: Go to Full Page ── */}
      <GoToFullPageLink notification={notification} onNavigate={onActionComplete} />
    </div>
  );
}
