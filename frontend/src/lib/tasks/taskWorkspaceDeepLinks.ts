import { nestedProjectPath } from "@/lib/projectNestedRoutes";

/**
 * Tasks workspace list lives at `/projects/<project>/tasks`.
 * Keep `create` + `origin_meeting_id` in the URL until the user finishes or cancels create
 * so origin is recoverable from a single place (URL + mirrored form state).
 */
export function taskWorkspaceCreateFromMeetingHref(
  projectId: number | string,
  meetingId: number | string,
): string {
  const p = new URLSearchParams();
  p.set("view", "timeline");
  p.set("create", "1");
  p.set("origin_meeting_id", String(meetingId));
  return nestedProjectPath(String(projectId), `/tasks?${p.toString()}`);
}
