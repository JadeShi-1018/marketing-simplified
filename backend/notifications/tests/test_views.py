from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Organization, Project, ProjectInvitation, ProjectMember
from notifications.models import (
    Notification,
    NotificationCategory,
    NotificationEventType,
    UserNotificationPreference,
)
from notifications.services import create_notification
User = get_user_model()


class NotificationAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="alice", password="pass12345", email="a@example.com")
        self.other = User.objects.create_user(username="bob", password="pass12345", email="b@example.com")
        self.client.force_authenticate(self.user)

    def test_list_empty(self):
        url = reverse("notification-list")
        r = self.client.get(url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data.get("count", 0), 0)

    def test_create_and_list(self):
        create_notification(
            recipient_id=self.user.id,
            actor_id=self.other.id,
            category=NotificationCategory.TASKS,
            event_type=NotificationEventType.TASK_ASSIGNED,
            title="Hello",
            body="Body",
        )
        url = reverse("notification-list")
        r = self.client.get(url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["count"], 1)
        self.assertEqual(r.data["results"][0]["title"], "Hello")

    def test_mark_read_ids(self):
        n = create_notification(
            recipient_id=self.user.id,
            actor_id=self.other.id,
            category=NotificationCategory.TASKS,
            event_type=NotificationEventType.TASK_ASSIGNED,
            title="Hello",
        )
        self.assertIsNotNone(n)
        url = reverse("notifications-read")
        r = self.client.patch(url, {"ids": [str(n.id)]}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        n.refresh_from_db()
        self.assertTrue(n.is_read)

    def test_mark_all_read(self):
        create_notification(
            recipient_id=self.user.id,
            actor_id=self.other.id,
            category=NotificationCategory.TASKS,
            event_type=NotificationEventType.TASK_ASSIGNED,
            title="A",
        )
        url = reverse("notifications-read")
        r = self.client.patch(url, {"mark_all": True}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertFalse(Notification.objects.filter(recipient=self.user, is_read=False).exists())

    def test_clear_all(self):
        create_notification(
            recipient_id=self.user.id,
            actor_id=self.other.id,
            category=NotificationCategory.TASKS,
            event_type=NotificationEventType.TASK_ASSIGNED,
            title="A",
        )
        url = reverse("notifications-clear")
        r = self.client.delete(url, {"scope": "all"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(Notification.objects.filter(recipient=self.user).count(), 0)

    def test_preferences_get(self):
        url = reverse("notification-preferences")
        r = self.client.get(url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertIn("preferences", r.data)
        self.assertIn("core_business", r.data["preferences"])
        self.assertIn("collaboration_assets", r.data["preferences"])

    def test_preferences_get_normalizes_corrupt_row_values(self):
        pref, _ = UserNotificationPreference.objects.get_or_create(user=self.user)
        pref.preferences = {
            "collaboration_assets": {"chat_in_app": None},
            "core_business": "not-a-dict",
        }
        pref.save()
        url = reverse("notification-preferences")
        r = self.client.get(url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        chat = r.data["preferences"]["collaboration_assets"]["chat_in_app"]
        self.assertIn("web", chat)
        self.assertIn("email", chat)
        self.assertIsInstance(r.data["preferences"]["core_business"], dict)

    def test_preferences_patch_disable(self):
        url = reverse("notification-preferences")
        r = self.client.patch(url, {"preferences": {"disable_all": True}}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(r.data["preferences"]["disable_all"])

    def test_preferences_patch_nested_row(self):
        url = reverse("notification-preferences")
        r = self.client.patch(
            url,
            {"preferences": {"core_business": {"task_status": {"web": False}}}},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertFalse(r.data["preferences"]["core_business"]["task_status"]["web"])

    def test_preferences_patch_creates_record_if_not_exists(self):
        """
        Test that PATCH creates a new UserNotificationPreference record
        if one does not already exist for the user.
        """
        # Ensure no preference record exists for the user
        UserNotificationPreference.objects.filter(user=self.user).delete()
        self.assertFalse(UserNotificationPreference.objects.filter(user=self.user).exists())

        url = reverse("notification-preferences")
        r = self.client.patch(
            url,
            {"preferences": {"collaboration_assets": {"chat_in_app": {"web": False}}}},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        # Record should now exist
        self.assertTrue(UserNotificationPreference.objects.filter(user=self.user).exists())
        # Value should be saved correctly
        self.assertFalse(r.data["preferences"]["collaboration_assets"]["chat_in_app"]["web"])
        # Other values should have defaults
        self.assertTrue(r.data["preferences"]["collaboration_assets"]["chat_in_app"]["email"])

    def test_preferences_patch_email_channel(self):
        """Test patching the email channel for a preference row."""
        url = reverse("notification-preferences")
        r = self.client.patch(
            url,
            {"preferences": {"core_business": {"task_deadline": {"email": False}}}},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertFalse(r.data["preferences"]["core_business"]["task_deadline"]["email"])
        # web channel should remain at default (True)
        self.assertTrue(r.data["preferences"]["core_business"]["task_deadline"]["web"])

    def test_preferences_patch_multiple_sections(self):
        """Test patching multiple sections in a single request."""
        url = reverse("notification-preferences")
        r = self.client.patch(
            url,
            {
                "preferences": {
                    "collaboration_assets": {"project_invite": {"web": False}},
                    "automation_system": {"workflow_nodes": {"email": False}},
                }
            },
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertFalse(r.data["preferences"]["collaboration_assets"]["project_invite"]["web"])
        self.assertFalse(r.data["preferences"]["automation_system"]["workflow_nodes"]["email"])

    def test_preferences_patch_idempotent(self):
        """Test that PATCH requests are idempotent."""
        url = reverse("notification-preferences")
        payload = {"preferences": {"integrations": {"slack_webhook": {"web": False}}}}

        # First PATCH
        r1 = self.client.patch(url, payload, format="json")
        self.assertEqual(r1.status_code, status.HTTP_200_OK)

        # Second identical PATCH
        r2 = self.client.patch(url, payload, format="json")
        self.assertEqual(r2.status_code, status.HTTP_200_OK)

        # Results should be the same
        self.assertEqual(
            r1.data["preferences"]["integrations"]["slack_webhook"],
            r2.data["preferences"]["integrations"]["slack_webhook"],
        )

    def test_respond_accept_project_invite_with_existing_accepted_invitation(self):
        """Drawer accept should succeed when a prior accepted invite row exists."""
        organization = Organization.objects.create(name="Org", email_domain="example.com")
        inviter = User.objects.create_user(
            username="inviter",
            password="pass12345",
            email="inviter@example.com",
            organization=organization,
        )
        invitee = User.objects.create_user(
            username="invitee",
            password="pass12345",
            email="invitee@example.com",
            organization=organization,
        )
        project = Project.objects.create(
            name="Reinvite Project",
            organization=organization,
            owner=inviter,
            objectives=["awareness"],
            kpis={"ctr": {"target": 0.02}},
        )
        ProjectMember.objects.create(user=inviter, project=project, role="owner", is_active=True)
        ProjectMember.objects.create(
            user=invitee,
            project=project,
            role="member",
            is_active=False,
        )

        ProjectInvitation.objects.create(
            email=invitee.email,
            project=project,
            role="member",
            invited_by=inviter,
            token="old-accepted-token",
            expires_at=timezone.now() + timedelta(days=7),
            approved=True,
            approved_by=inviter,
            approved_at=timezone.now(),
            accepted=True,
            accepted_at=timezone.now(),
        )

        new_invitation = ProjectInvitation.objects.create(
            email=invitee.email,
            project=project,
            role="member",
            invited_by=inviter,
            token="new-pending-token",
            expires_at=timezone.now() + timedelta(days=7),
            approved=True,
            approved_by=inviter,
            approved_at=timezone.now(),
            accepted=False,
        )

        notification = create_notification(
            recipient_id=invitee.id,
            actor_id=inviter.id,
            category=NotificationCategory.COLLABORATION,
            event_type=NotificationEventType.PROJECT_INVITE,
            title=f"You've been invited to project: {project.name}",
            body="Please join.",
            related_object_type="project",
            related_object_id=str(project.id),
            action_url=f"/projects/{project.id}",
            metadata={
                "project_name": project.name,
                "invitation_id": new_invitation.pk,
            },
        )

        client = APIClient()
        client.force_authenticate(user=invitee)
        url = reverse("notifications-respond", kwargs={"pk": notification.id})
        response = client.post(url, {"action": "accept"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        membership = ProjectMember.objects.get(user=invitee, project=project)
        self.assertTrue(membership.is_active)
        self.assertEqual(membership.role, "member")

        new_invitation.refresh_from_db()
        self.assertTrue(new_invitation.accepted)

        self.assertEqual(
            ProjectInvitation.objects.filter(
                email=invitee.email,
                project=project,
                accepted=True,
            ).count(),
            1,
        )

        notification.refresh_from_db()
        self.assertTrue(notification.responded)
        self.assertEqual(notification.response, "accept")

        feedback = Notification.objects.filter(
            recipient=inviter,
            metadata__is_response_feedback=True,
        )
        self.assertTrue(feedback.exists())
        self.assertIn("accepted", feedback.first().title.lower())

    def test_preferences_patch_invalid_payload_missing_preferences(self):
        """Test that PATCH fails when preferences key is missing."""
        url = reverse("notification-preferences")
        r = self.client.patch(url, {"disable_all": True}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_preferences_patch_invalid_payload_not_dict(self):
        """Test that PATCH fails when preferences is not a dict."""
        url = reverse("notification-preferences")
        r = self.client.patch(url, {"preferences": "not-a-dict"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
