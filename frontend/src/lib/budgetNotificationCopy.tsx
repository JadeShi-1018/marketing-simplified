import type { ReactNode } from "react";
import type { NotificationItem } from "@/types/notifications";

export type BudgetChangeType =
  | "budget_submitted"
  | "budget_forwarded"
  | "budget_approved"
  | "budget_rejected"
  | "budget_locked"
  | "budget_pool_insufficient"
  | "budget_cancelled"
  | "budget_escalated";

export function budgetChangeType(notification: NotificationItem): BudgetChangeType | null {
  const ct = notification.metadata?.change_type as string | undefined;
  if (ct && ct.startsWith("budget_")) {
    return ct as BudgetChangeType;
  }
  if (notification.event_type === "budget_review_needed") {
    return "budget_submitted";
  }
  if (notification.event_type === "budget_escalation") {
    return "budget_escalated";
  }
  if (notification.event_type === "budget_pool_low") {
    return "budget_pool_insufficient";
  }
  return null;
}

export function budgetLabelFromNotification(notification: NotificationItem): string {
  const fromMeta = notification.metadata?.budget_summary as string | undefined;
  if (fromMeta?.trim()) return fromMeta.trim();
  const title = notification.title || "";
  const idx = title.indexOf(": ");
  if (idx >= 0) {
    const label = title.slice(idx + 2).trim();
    if (label) return label;
  }
  return "this budget request";
}

export function BudgetActorInline({
  name,
  avatar,
}: {
  name: string;
  avatar?: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-1 align-middle mr-1">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3CCED7] to-[#A6E661] text-[10px] font-semibold text-white overflow-hidden">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </span>
      <span className="font-semibold text-gray-900">{name}</span>
    </span>
  );
}

export function getBudgetSVODescription(
  notification: NotificationItem,
  actor: ReactNode
): ReactNode {
  const label = budgetLabelFromNotification(notification);
  const changeType = budgetChangeType(notification);

  switch (changeType) {
    case "budget_submitted":
      return (
        <>
          {actor} submitted{" "}
          <span className="font-semibold text-gray-900">{label}</span> for your approval.
        </>
      );
    case "budget_forwarded":
      return (
        <>
          {actor} forwarded{" "}
          <span className="font-semibold text-gray-900">{label}</span> for your approval.
        </>
      );
    case "budget_approved":
      return (
        <>
          {actor} approved{" "}
          <span className="font-semibold text-gray-900">{label}</span>.
        </>
      );
    case "budget_rejected":
      return (
        <>
          {actor} rejected{" "}
          <span className="font-semibold text-gray-900">{label}</span>.
        </>
      );
    case "budget_locked":
      return (
        <>
          {actor} locked{" "}
          <span className="font-semibold text-gray-900">{label}</span> and deducted from the
          budget pool.
        </>
      );
    case "budget_cancelled":
      return (
        <>
          {actor} cancelled{" "}
          <span className="font-semibold text-gray-900">{label}</span>.
        </>
      );
    case "budget_pool_insufficient":
      if (actor) {
        return (
          <>
            {actor} attempted to lock{" "}
            <span className="font-semibold text-gray-900">{label}</span>, but the budget pool
            has insufficient funds.
          </>
        );
      }
      return (
        <>
          The budget pool has insufficient funds to lock{" "}
          <span className="font-semibold text-gray-900">{label}</span>.
        </>
      );
    case "budget_escalated":
      return (
        <>
          Budget request{" "}
          <span className="font-semibold text-gray-900">{label}</span> was escalated due to
          amount threshold.
        </>
      );
    default:
      return notification.body || "Budget notification.";
  }
}

export function isBudgetNotification(notification: NotificationItem): boolean {
  const et = notification.event_type;
  return (
    et === "budget_review_needed" ||
    et === "budget_approval_result" ||
    et === "budget_pool_low" ||
    et === "budget_escalation" ||
    notification.related_object_type?.toLowerCase() === "budget_request"
  );
}
