import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  AtSign,
  Bell,
  BellRing,
  Briefcase,
  Calendar,
  CheckSquare,
  ClipboardList,
  ClipboardCheck,
  Clock,
  FileCheck,
  GitBranch,
  Link2,
  MessageSquare,
  Reply,
  Scale,
  ThumbsUp,
  UserMinus,
  UserPlus,
  Zap,
  PencilLine,
} from "lucide-react";
import type { NotificationItem } from "@/types/notifications";

/** Business domain — drives panel left bar + first drawer pill */
export type NotificationModuleKey =
  | "project"
  | "meeting"
  | "task"
  | "decision"
  | "collaboration"
  | "approval"
  | "automation"
  | "integration"
  | "system";

/** Notification action bucket — second drawer pill (separate color system) */
export type NotificationTypeKey =
  | "invite"
  | "assignment"
  | "update"
  | "removal"
  | "mention"
  | "deadline"
  | "alert"
  | "reminder"
  | "feedback"
  | "approval"
  | "workflow"
  | "publish"
  | "default";

const INVITE_EVENTS = new Set(["project_invite", "meeting_participant_added"]);
const ASSIGNMENT_EVENTS = new Set(["task_assigned", "task_owner_changed"]);
const DEADLINE_EVENTS = new Set([
  "task_deadline_soon",
  "task_overdue",
  "decision_deadline",
  "meeting_starting_soon",
]);
const UPDATE_EVENTS = new Set([
  "meeting_created",
  "meeting_updated",
  "meeting_agenda_changed",
  "doc_asset_update",
  "task_status_changed",
]);

export function deriveModule(notification: NotificationItem): NotificationModuleKey {
  const rot = (notification.related_object_type || "").toLowerCase();
  const et = notification.event_type || "";
  const cat = (notification.category || "").toUpperCase();

  if (rot === "project") return "project";
  if (rot === "meeting") return "meeting";
  if (rot === "task") return "task";
  if (rot === "decision") return "decision";

  if (et.startsWith("chat_")) return "collaboration";
  if (et === "calendar_reminder" || et === "doc_asset_update") return "collaboration";
  if (et === "project_invite") return "project";

  if (cat === "APPROVAL") return "approval";
  if (cat === "AUTOMATION") return "automation";
  if (cat === "INTEGRATIONS") return "integration";
  if (cat === "SYSTEM") return "system";

  if (et === "budget_approval_result") return "approval";
  if (et === "workflow_node") return "automation";
  if (et === "billing_anomaly" || et === "system") return "system";

  if (et === "account_permission") {
    const action = notification.metadata?.action as string | undefined;
    if (action === "removed_from_project") return "project";
    return "system";
  }

  if (cat === "MEETINGS") return "meeting";
  if (cat === "TASKS") return "task";
  if (cat === "DECISIONS") return "decision";
  if (cat === "COLLABORATION") return "collaboration";

  return "system";
}

export function deriveTypeKey(notification: NotificationItem): NotificationTypeKey {
  const et = notification.event_type || "";
  const meta = notification.metadata || {};

  if (meta.is_response_feedback) return "feedback";

  if (INVITE_EVENTS.has(et)) return "invite";
  if (ASSIGNMENT_EVENTS.has(et)) return "assignment";

  if (et === "meeting_participant_removed") return "removal";
  if (et === "account_permission" && meta.action === "removed_from_project") {
    return "removal";
  }

  if (et === "task_comment_mention") return "mention";
  if (DEADLINE_EVENTS.has(et)) return "deadline";

  if (et === "task_anomaly" || et === "billing_anomaly") return "alert";
  if (et === "calendar_reminder") return "reminder";

  if (et === "decision_review_needed" || et === "budget_approval_result") {
    return "approval";
  }
  if (et === "workflow_node") return "workflow";

  if (et === "meeting_minutes_published" || et === "decision_published") {
    return "publish";
  }

  if (UPDATE_EVENTS.has(et)) return "update";

  return "default";
}

export interface ModuleVisual {
  label: string;
  /** Tailwind bg class for 3px panel strip */
  barClass: string;
  tagBg: string;
  tagText: string;
  icon: LucideIcon;
}

export interface TypeVisual {
  label: string;
  tagBg: string;
  tagText: string;
  icon: LucideIcon;
}

export const MODULE_VISUALS: Record<NotificationModuleKey, ModuleVisual> = {
  project: {
    label: "Project",
    barClass: "bg-blue-500",
    tagBg: "bg-blue-50",
    tagText: "text-blue-800",
    icon: Briefcase,
  },
  meeting: {
    label: "Meeting",
    barClass: "bg-amber-500",
    tagBg: "bg-amber-50",
    tagText: "text-amber-900",
    icon: Calendar,
  },
  task: {
    label: "Task",
    barClass: "bg-orange-500",
    tagBg: "bg-orange-50",
    tagText: "text-orange-900",
    icon: CheckSquare,
  },
  decision: {
    label: "Decision",
    barClass: "bg-violet-600",
    tagBg: "bg-violet-50",
    tagText: "text-violet-900",
    icon: Scale,
  },
  collaboration: {
    label: "Collaboration",
    barClass: "bg-teal-500",
    tagBg: "bg-teal-50",
    tagText: "text-teal-900",
    icon: MessageSquare,
  },
  approval: {
    label: "Approval",
    barClass: "bg-rose-500",
    tagBg: "bg-rose-50",
    tagText: "text-rose-900",
    icon: ThumbsUp,
  },
  automation: {
    label: "Automation",
    barClass: "bg-indigo-500",
    tagBg: "bg-indigo-50",
    tagText: "text-indigo-900",
    icon: Zap,
  },
  integration: {
    label: "Integration",
    barClass: "bg-slate-500",
    tagBg: "bg-slate-100",
    tagText: "text-slate-800",
    icon: Link2,
  },
  system: {
    label: "System",
    barClass: "bg-gray-500",
    tagBg: "bg-gray-100",
    tagText: "text-gray-800",
    icon: Bell,
  },
};

export const TYPE_VISUALS: Record<NotificationTypeKey, TypeVisual> = {
  invite: {
    label: "Invite",
    tagBg: "bg-emerald-50",
    tagText: "text-emerald-800",
    icon: UserPlus,
  },
  assignment: {
    label: "Assignment",
    tagBg: "bg-sky-50",
    tagText: "text-sky-900",
    icon: ClipboardList,
  },
  update: {
    label: "Update",
    tagBg: "bg-cyan-50",
    tagText: "text-cyan-900",
    icon: PencilLine,
  },
  removal: {
    label: "Removed",
    tagBg: "bg-red-50",
    tagText: "text-red-800",
    icon: UserMinus,
  },
  mention: {
    label: "Mention",
    tagBg: "bg-fuchsia-50",
    tagText: "text-fuchsia-900",
    icon: AtSign,
  },
  deadline: {
    label: "Deadline",
    tagBg: "bg-amber-100",
    tagText: "text-amber-950",
    icon: BellRing,
  },
  alert: {
    label: "Alert",
    tagBg: "bg-orange-100",
    tagText: "text-orange-950",
    icon: AlertTriangle,
  },
  reminder: {
    label: "Reminder",
    tagBg: "bg-lime-50",
    tagText: "text-lime-900",
    icon: Clock,
  },
  feedback: {
    label: "Response",
    tagBg: "bg-teal-100",
    tagText: "text-teal-950",
    icon: Reply,
  },
  approval: {
    label: "Review",
    tagBg: "bg-pink-50",
    tagText: "text-pink-900",
    icon: ClipboardCheck,
  },
  workflow: {
    label: "Workflow",
    tagBg: "bg-indigo-100",
    tagText: "text-indigo-950",
    icon: GitBranch,
  },
  publish: {
    label: "Published",
    tagBg: "bg-green-50",
    tagText: "text-green-900",
    icon: FileCheck,
  },
  default: {
    label: "Notification",
    tagBg: "bg-neutral-100",
    tagText: "text-neutral-800",
    icon: Bell,
  },
};

export function getModuleBarClass(notification: NotificationItem): string {
  const key = deriveModule(notification);
  return MODULE_VISUALS[key].barClass;
}
