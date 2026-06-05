import type { ReactNode } from "react";
import type { NotificationItem } from "@/types/notifications";

/** Extract decision title from notification title (e.g. "Decision approved: Foo" → "Foo"). */
export function decisionLabelFromNotification(notification: NotificationItem): string {
  const title = notification.title || "";
  const idx = title.indexOf(": ");
  if (idx >= 0) {
    const label = title.slice(idx + 2).trim();
    if (label) return label;
  }
  return "this decision";
}

export function DecisionActorInline({
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

/** Commit → review needed: [actor] submitted [decision] for your approval. */
export function getDecisionReviewSVODescription(
  notification: NotificationItem,
  actor: ReactNode
): ReactNode {
  const label = decisionLabelFromNotification(notification);
  return (
    <>
      {actor} submitted{" "}
      <span className="font-semibold text-gray-900">{label}</span> for your approval.
    </>
  );
}

/** Approve → published: [actor] approved [decision]. */
export function getDecisionPublishedSVODescription(
  notification: NotificationItem,
  actor: ReactNode
): ReactNode {
  const label = decisionLabelFromNotification(notification);
  return (
    <>
      {actor} approved{" "}
      <span className="font-semibold text-gray-900">{label}</span>.
    </>
  );
}
