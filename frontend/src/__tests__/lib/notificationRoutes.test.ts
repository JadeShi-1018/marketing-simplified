import type { NotificationItem } from "@/types/notifications";
import {
  buildNotificationFullPageTarget,
  extractNotificationProjectId,
  parseProjectIdFromActionUrl,
} from "@/lib/notificationRoutes";

function makeNotification(
  overrides: Partial<NotificationItem> = {}
): NotificationItem {
  return {
    id: "1",
    category: "TASKS",
    event_type: "task_assigned",
    related_object_type: "task",
    related_object_id: "42",
    title: "Test",
    body: "",
    is_read: false,
    action_url: "",
    metadata: {},
    created_at: "2024-01-01T00:00:00Z",
    responded: false,
    response: "",
    ...overrides,
  };
}

describe("notificationRoutes", () => {
  it("parses project_id from legacy and new action URLs", () => {
    expect(parseProjectIdFromActionUrl("/projects/5/meetings/9")).toBe(5);
    expect(parseProjectIdFromActionUrl("/meetings/9?project_id=5")).toBe(5);
  });

  it("extracts project_id from notification metadata", () => {
    const notification = makeNotification({
      metadata: { project_id: 7 },
      action_url: "/projects/99/tasks/1",
    });
    expect(extractNotificationProjectId(notification)).toBe(7);
  });

  it("maps task notifications to the v2 task detail route", () => {
    const target = buildNotificationFullPageTarget(
      makeNotification({
        related_object_type: "task",
        related_object_id: "42",
        metadata: { project_id: 1 },
        action_url: "/projects/1/tasks/42",
      })
    );
    expect(target).toEqual({
      href: "/tasks/42",
      requiresProjectSwitch: false,
    });
  });

  it("maps meeting notifications to the v2 meeting detail route", () => {
    const target = buildNotificationFullPageTarget(
      makeNotification({
        related_object_type: "meeting",
        related_object_id: "9",
        metadata: { project_id: 5 },
        action_url: "/projects/5/meetings/9",
      })
    );
    expect(target).toEqual({
      href: "/meetings/9?project_id=5",
      requiresProjectSwitch: false,
    });
  });

  it("maps decision notifications to the v2 decision detail route", () => {
    const target = buildNotificationFullPageTarget(
      makeNotification({
        related_object_type: "decision",
        related_object_id: "12",
        metadata: { project_id: 3 },
        action_url: "/projects/3/decisions/12",
      })
    );
    expect(target).toEqual({
      href: "/decisions/12?project_id=3",
      requiresProjectSwitch: false,
    });
  });

  it("maps project notifications to overview with project switch", () => {
    const target = buildNotificationFullPageTarget(
      makeNotification({
        related_object_type: "project",
        related_object_id: "8",
        action_url: "/projects/8",
      })
    );
    expect(target).toEqual({
      href: "/overview",
      requiresProjectSwitch: true,
      projectId: 8,
    });
  });

  it("translates legacy action_url when related_object_type is missing", () => {
    const target = buildNotificationFullPageTarget(
      makeNotification({
        related_object_type: "",
        related_object_id: "",
        action_url: "/projects/2/decisions/15",
      })
    );
    expect(target).toEqual({
      href: "/decisions/15?project_id=2",
      requiresProjectSwitch: false,
    });
  });
});
