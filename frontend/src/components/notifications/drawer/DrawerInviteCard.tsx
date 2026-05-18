"use client";

import React, { useState } from "react";
import {
  Check,
  X,
  Loader2,
  Calendar,
  CheckSquare,
  Briefcase,
  UserPlus,
} from "lucide-react";
import toast from "react-hot-toast";
import { notificationsApi } from "@/lib/api/notificationsApi";
import type { NotificationItem } from "@/types/notifications";
import DrawerSectionDivider from "./DrawerSectionDivider";

// ── Which event_types are invite-type ─────────────────────────────────────────

const INVITE_EVENT_TYPES = new Set([
  "project_invite",
  "meeting_participant_added",
  "task_owner_changed",
]);

export function isInviteNotification(notification: NotificationItem): boolean {
  // Response-feedback notifications (actor receives "X accepted/declined") are NOT invites
  if (notification.metadata?.is_response_feedback) return false;
  const et = notification.event_type;
  if (INVITE_EVENT_TYPES.has(et)) return true;
  // task_assigned is an invite only when change_type explicitly marks it so
  if (et === "task_assigned") {
    const ct = notification.metadata?.change_type as string | undefined;
    return ct === "task_assignee" || ct === "task_approver";
  }
  return false;
}

// ── Invite context config ─────────────────────────────────────────────────────

interface InviteConfig {
  Icon: React.ElementType;
  typeLabel: string;
  subjectLabel: string;
}

function getInviteConfig(notification: NotificationItem): InviteConfig {
  const { event_type, metadata, title } = notification;
  const subject =
    (metadata?.project_name as string) ||
    (metadata?.meeting_title as string) ||
    (metadata?.task_title as string) ||
    title;

  switch (event_type) {
    case "project_invite":
      return { Icon: Briefcase, typeLabel: "Project Invitation", subjectLabel: subject };
    case "meeting_participant_added":
      return { Icon: Calendar, typeLabel: "Meeting Invitation", subjectLabel: subject };
    case "task_owner_changed":
      return { Icon: CheckSquare, typeLabel: "Task Ownership Transfer", subjectLabel: subject };
    case "task_assigned": {
      const ct = notification.metadata?.change_type as string | undefined;
      return {
        Icon: CheckSquare,
        typeLabel: ct === "task_approver" ? "Approval Request" : "Task Assignment",
        subjectLabel: subject,
      };
    }
    default:
      return { Icon: UserPlus, typeLabel: "Invitation", subjectLabel: subject };
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ActorDisplay({ name, avatar }: { name: string; avatar?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3CCED7] to-[#A6E661] text-[10px] font-semibold text-white overflow-hidden">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </span>
      <span className="font-medium text-gray-900 text-sm">{name}</span>
    </span>
  );
}

function RespondedBanner({ response }: { response: string }) {
  const accepted = response === "accept";
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
        accepted
          ? "bg-gradient-to-r from-[#3CCED7] to-[#A6E661] text-white shadow-sm"
          : "border border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {accepted ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
      {accepted ? "You accepted this invitation" : "You declined this invitation"}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DrawerInviteCardProps {
  notification: NotificationItem;
}

export default function DrawerInviteCard({ notification }: DrawerInviteCardProps) {
  const initialResponse =
    notification.responded && notification.response ? notification.response : null;
  const [localResponse, setLocalResponse] = useState<string | null>(initialResponse);
  const [loading, setLoading] = useState<"accept" | "reject" | null>(null);

  const { Icon, typeLabel, subjectLabel } = getInviteConfig(notification);
  const actorName = notification.actor_name;
  const actorAvatar = notification.actor_avatar;

  const handle = async (action: "accept" | "reject") => {
    setLoading(action);
    try {
      await notificationsApi.respond(notification.id, action);
      setLocalResponse(action === "accept" ? "accept" : "reject");
      toast.success(action === "accept" ? "Accepted!" : "Declined");
    } catch {
      toast.error(`Failed to ${action === "accept" ? "accept" : "decline"}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <DrawerSectionDivider />
      <div className="px-5 py-4">
      {/* Drawer section heading — blend ~midpoint between brand teal #3CCED7 and lime #A6E661 → #71DA9C */}
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#71DA9C]">
        Invitation
      </div>
      <div className="space-y-3 rounded-lg border border-[#3CCED7]/25 bg-gradient-to-r from-[#3CCED7]/8 to-[#A6E661]/8 p-4">
        {/* Type label + subject */}
        <div className="flex items-start gap-2">
          <Icon className="w-4 h-4 text-brand-teal mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900">{typeLabel}</p>
            <p className="text-sm text-gray-600 mt-0.5">{subjectLabel}</p>
          </div>
        </div>

        {/* Invited by */}
        {actorName && (
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <span>Invited by</span>
            <ActorDisplay name={actorName} avatar={actorAvatar} />
          </div>
        )}

        {/* Action buttons or responded state */}
        {localResponse ? (
          <RespondedBanner response={localResponse} />
        ) : (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => handle("accept")}
              disabled={loading !== null}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#3CCED7] to-[#A6E661] px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {loading === "accept" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Accept
            </button>
            <button
              type="button"
              onClick={() => handle("reject")}
              disabled={loading !== null}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white text-red-600 text-sm font-medium border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {loading === "reject" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              Decline
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
