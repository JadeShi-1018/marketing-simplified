import { ProjectAPI } from "@/lib/api/projectApi";
import { useProjectStore } from "@/lib/projectStore";
import type { NotificationItem } from "@/types/notifications";
import { NOTIFICATION_EVENT } from "@/types/notifications";

export interface NotificationNavigationTarget {
  href: string;
  requiresProjectSwitch: boolean;
  projectId?: number | string;
}

export function parseProjectIdFromActionUrl(actionUrl: string): number | string | undefined {
  const legacyMatch = actionUrl.match(/\/projects\/([^/]+)/);
  if (legacyMatch) {
    const rawVal = legacyMatch[1];
    const projectId = Number(rawVal);
    if (Number.isFinite(projectId) && projectId > 0) return projectId;
    return rawVal;
  }

  try {
    const url = new URL(actionUrl, "http://local");
    const fromQuery = url.searchParams.get("project_id");
    if (fromQuery) {
      const projectId = Number(fromQuery);
      if (Number.isFinite(projectId) && projectId > 0) return projectId;
      return fromQuery;
    }
  } catch {
    // ignore malformed URLs
  }

  return undefined;
}

export function extractNotificationProjectId(
  notification: NotificationItem
): number | string | undefined {
  const { metadata, action_url: actionUrl } = notification;
  const taskMeta = metadata?.task as Record<string, unknown> | undefined;
  const meetingMeta = metadata?.meeting as Record<string, unknown> | undefined;

  const raw =
    metadata?.project_id ??
    metadata?.project ??
    taskMeta?.project_id ??
    meetingMeta?.project_id;

  if (raw != null) {
    const projectId = Number(raw);
    if (Number.isFinite(projectId) && projectId > 0) return projectId;
    if (typeof raw === "string" && raw.trim()) return raw;
  }

  if (actionUrl) {
    return parseProjectIdFromActionUrl(actionUrl);
  }

  return undefined;
}

function withProjectQuery(path: string, projectId: number | string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}project_id=${projectId}`;
}

function translateLegacyActionUrl(actionUrl: string): NotificationNavigationTarget | null {
  const projectTask = actionUrl.match(/^\/projects\/([^/]+)\/tasks\/([^/]+)/);
  if (projectTask) {
    return { href: `/tasks/${projectTask[2]}`, requiresProjectSwitch: false };
  }

  const projectMeeting = actionUrl.match(/^\/projects\/([^/]+)\/meetings\/([^/]+)/);
  if (projectMeeting) {
    return {
      href: `/meetings/${projectMeeting[2]}?project_id=${projectMeeting[1]}`,
      requiresProjectSwitch: false,
    };
  }

  const projectDecision = actionUrl.match(/^\/projects\/([^/]+)\/decisions\/([^/]+)/);
  if (projectDecision) {
    return {
      href: `/decisions/${projectDecision[2]}?project_id=${projectDecision[1]}`,
      requiresProjectSwitch: false,
    };
  }

  const projectOnly = actionUrl.match(/^\/projects\/([^/]+)\/?$/);
  if (projectOnly) {
    const rawVal = projectOnly[1];
    const pid = Number(rawVal);
    return {
      href: "/overview",
      requiresProjectSwitch: true,
      projectId: Number.isFinite(pid) && pid > 0 ? pid : rawVal,
    };
  }

  if (actionUrl.startsWith("/") && !actionUrl.startsWith("//")) {
    return { href: actionUrl, requiresProjectSwitch: false };
  }

  return null;
}

export function buildNotificationFullPageTarget(
  notification: NotificationItem
): NotificationNavigationTarget | null {
  const {
    related_object_type,
    related_object_id,
    related_object_slug,
    metadata,
    action_url: actionUrl,
    event_type: eventType,
  } = notification;
  const objectType = related_object_type?.toLowerCase();

  if (
    eventType === NOTIFICATION_EVENT.CHAT_NEW_MESSAGE ||
    eventType === NOTIFICATION_EVENT.CHAT_NEW_CONVERSATION ||
    eventType === NOTIFICATION_EVENT.CHAT_MENTION
  ) {
    if (actionUrl) {
      return translateLegacyActionUrl(actionUrl) ?? { href: actionUrl, requiresProjectSwitch: false };
    }
    const chatId = metadata?.chat_id;
    const projectId = extractNotificationProjectId(notification);
    if (chatId && projectId) {
      return {
        href: `/messages?chatId=${chatId}&projectId=${projectId}`,
        requiresProjectSwitch: false,
      };
    }
    return { href: "/messages", requiresProjectSwitch: false };
  }

  const projectId = extractNotificationProjectId(notification);

  if (objectType === "project" && related_object_id) {
    const pid = Number(related_object_id);
    const resolvedProjectId = Number.isFinite(pid) && pid > 0 ? pid : String(related_object_id);
    return { href: "/overview", requiresProjectSwitch: true, projectId: resolvedProjectId };
  }

  if (objectType === "task" && related_object_id) {
    const taskKey = related_object_slug ?? related_object_id;
    return { href: `/tasks/${taskKey}`, requiresProjectSwitch: false };
  }

  if (objectType === "meeting" && related_object_id) {
    const meetingKey = related_object_slug ?? related_object_id;
    const href = projectId
      ? withProjectQuery(`/meetings/${meetingKey}`, projectId)
      : `/meetings/${meetingKey}`;
    return { href, requiresProjectSwitch: false };
  }

  if (objectType === "decision" && related_object_id) {
    const decisionKey = related_object_slug ?? related_object_id;
    const href = projectId
      ? withProjectQuery(`/decisions/${decisionKey}`, projectId)
      : `/decisions/${decisionKey}`;
    return { href, requiresProjectSwitch: false };
  }

  if (objectType === "budget_request") {
    const taskId = metadata?.task_slug ?? metadata?.task_id ?? related_object_slug ?? related_object_id;
    if (taskId) {
      return { href: `/tasks/${taskId}`, requiresProjectSwitch: false };
    }
  }

  if (actionUrl) {
    return translateLegacyActionUrl(actionUrl);
  }

  return null;
}

export async function activateProjectForNavigation(projectId: number | string): Promise<void> {
  const store = useProjectStore.getState();
  if (
    String(store.activeProject?.id) === String(projectId) ||
    store.activeProject?.slug === projectId
  )
    return;

  const fromStore = store.projects.find(
    (project) =>
      String(project.id) === String(projectId) || project.slug === projectId
  );
  if (fromStore) {
    store.setActiveProject(fromStore);
    return;
  }

  const project = await ProjectAPI.getProject(projectId);
  store.setActiveProject(project);
}
