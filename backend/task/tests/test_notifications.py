from datetime import date

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Organization, Project, ProjectMember
from notifications.models import Notification, NotificationEventType
from task.models import Task

User = get_user_model()


class TaskDueDateNotificationTests(APITestCase):
    """Due date edits emit TASK_OWNER_CHANGED with task_due_date metadata."""

    def setUp(self):
        self.editor = User.objects.create_user(
            email="editor@example.com",
            username="editor",
            password="pass12345",
        )
        self.owner = User.objects.create_user(
            email="owner@example.com",
            username="owner",
            password="pass12345",
        )
        self.organization = Organization.objects.create(name="Notif Org")
        self.project = Project.objects.create(
            name="Notif Project",
            organization=self.organization,
        )
        for user in (self.editor, self.owner):
            ProjectMember.objects.create(
                user=user,
                project=self.project,
                role="member",
                is_active=True,
            )

        self.task = Task.objects.create(
            summary="Deadline notification task",
            type="budget",
            project=self.project,
            owner=self.owner,
            current_approver=self.editor,
            owner_invite_pending=False,
            due_date=date(2026, 5, 20),
        )

        self.client.force_authenticate(user=self.editor)

    def test_due_date_change_emits_task_owner_changed_with_metadata(self):
        url = reverse("task-detail", kwargs={"pk": self.task.id})
        response = self.client.patch(
            url,
            {"due_date": "2026-05-25"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        notif = Notification.objects.filter(
            recipient_id=self.owner.id,
            event_type=NotificationEventType.TASK_OWNER_CHANGED,
            related_object_id=str(self.task.id),
        ).first()
        self.assertIsNotNone(notif, "Owner should receive a due date change notification")
        self.assertEqual(notif.metadata.get("change_type"), "task_due_date")
        self.assertEqual(notif.metadata.get("old_value"), "2026-05-20")
        self.assertEqual(notif.metadata.get("new_value"), "2026-05-25")
        self.assertEqual(notif.actor_id, self.editor.id)


class TaskStatusChangeNotificationTests(APITestCase):
    """Status transitions notify the owner with the acting user as actor."""

    def setUp(self):
        self.approver = User.objects.create_user(
            email="approver@example.com",
            username="approver",
            password="pass12345",
        )
        self.owner = User.objects.create_user(
            email="owner@example.com",
            username="owner",
            password="pass12345",
        )
        self.organization = Organization.objects.create(name="Status Notif Org")
        self.project = Project.objects.create(
            name="Status Notif Project",
            organization=self.organization,
        )
        for user in (self.approver, self.owner):
            ProjectMember.objects.create(
                user=user,
                project=self.project,
                role="member",
                is_active=True,
            )

        self.task = Task.objects.create(
            summary="Status notification task",
            type="budget",
            project=self.project,
            owner=self.owner,
            current_approver=self.approver,
            owner_invite_pending=False,
        )
        self.task.submit()
        self.task.save()
        self.task.start_review()
        self.task.save()

        self.client.force_authenticate(user=self.approver)

    def test_status_change_sets_actor_on_owner_notification(self):
        url = reverse("task-make-approval", kwargs={"pk": self.task.id})
        response = self.client.post(url, {"action": "approve"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        notif = Notification.objects.filter(
            recipient_id=self.owner.id,
            event_type=NotificationEventType.TASK_STATUS_CHANGED,
            related_object_id=str(self.task.id),
        ).first()
        self.assertIsNotNone(notif, "Owner should receive a status change notification")
        self.assertEqual(notif.actor_id, self.approver.id)
        self.assertEqual(notif.metadata.get("change_type"), "task_status")
        self.assertEqual(notif.metadata.get("old_value"), Task.Status.UNDER_REVIEW)
        self.assertEqual(notif.metadata.get("new_value"), Task.Status.APPROVED)
