"""
Tests for ParticipantLinkViewSet, ArtifactLinkViewSet,
MeetingActionItemViewSet CRUD, and MeetingAuditLogViewSet.

These are the three ViewSets that had zero or near-zero coverage.
"""
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Organization, Project, ProjectMember, CustomUser
from meetings.models import (
    Meeting,
    MeetingTypeDefinition,
    ParticipantLink,
    ArtifactLink,
    MeetingActionItem,
    MeetingAuditLog,
)


def _make_meeting(project, title="Test Meeting", **kwargs):
    type_def, _ = MeetingTypeDefinition.objects.get_or_create(
        project=project,
        slug="planning",
        defaults={"label": "Planning"},
    )
    return Meeting.objects.create(
        project=project,
        title=title,
        type_definition=type_def,
        objective="Some objective",
        **kwargs,
    )


class TestParticipantLinkAPI(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Org PL", slug="org-pl-test")
        self.project = Project.objects.create(name="Project PL", organization=self.org)

        self.user_a = CustomUser.objects.create_user(
            email="pl_user_a@example.com", password="pw", username="pl_user_a"
        )
        self.user_b = CustomUser.objects.create_user(
            email="pl_user_b@example.com", password="pw", username="pl_user_b"
        )
        self.non_member = CustomUser.objects.create_user(
            email="pl_non_member@example.com", password="pw", username="pl_non_member"
        )

        ProjectMember.objects.create(user=self.user_a, project=self.project, is_active=True)
        ProjectMember.objects.create(user=self.user_b, project=self.project, is_active=True)

        self.meeting = _make_meeting(self.project)
        self.client.force_authenticate(user=self.user_a)

    def _url(self, suffix=""):
        return (
            f"/api/projects/{self.project.slug}"
            f"/meetings/{self.meeting.slug}/participants/{suffix}"
        )

    def test_list_participants_empty(self):
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Result may be paginated or plain list
        data = res.data
        if isinstance(data, dict) and "results" in data:
            items = data["results"]
        else:
            items = data
        self.assertEqual(items, [])

    def test_create_participant_self_auto_accepts(self):
        """Adding yourself as a participant should set is_accepted=True."""
        res = self.client.post(
            self._url(), {"user": self.user_a.id, "role": "organizer"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        link = ParticipantLink.objects.get(meeting=self.meeting, user=self.user_a)
        self.assertTrue(link.is_accepted)

    def test_create_participant_other_user_not_auto_accepted(self):
        """Adding another user as a participant: is_accepted remains False until they accept."""
        res = self.client.post(
            self._url(), {"user": self.user_b.id, "role": "attendee"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        link = ParticipantLink.objects.get(meeting=self.meeting, user=self.user_b)
        self.assertFalse(link.is_accepted)

    def test_create_duplicate_participant_returns_400(self):
        """Creating a duplicate (meeting, user) participant should return 400."""
        ParticipantLink.objects.create(meeting=self.meeting, user=self.user_b)
        res = self.client.post(
            self._url(), {"user": self.user_b.id}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_destroy_participant(self):
        link = ParticipantLink.objects.create(meeting=self.meeting, user=self.user_b)
        res = self.client.delete(self._url(f"{link.id}/"))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ParticipantLink.objects.filter(pk=link.id).exists())

    def test_non_member_cannot_access_participants(self):
        """Non-members of the project get 403 when listing participants."""
        self.client.force_authenticate(user=self.non_member)
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_participants_shows_created(self):
        ParticipantLink.objects.create(meeting=self.meeting, user=self.user_a)
        ParticipantLink.objects.create(meeting=self.meeting, user=self.user_b)
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        items = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertEqual(len(items), 2)


class TestArtifactLinkAPI(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Org AL", slug="org-al-test")
        self.project = Project.objects.create(name="Project AL", organization=self.org)

        self.user = CustomUser.objects.create_user(
            email="al_user@example.com", password="pw", username="al_user"
        )
        self.other_user = CustomUser.objects.create_user(
            email="al_other@example.com", password="pw", username="al_other"
        )
        ProjectMember.objects.create(user=self.user, project=self.project, is_active=True)
        ProjectMember.objects.create(user=self.other_user, project=self.project, is_active=True)

        self.meeting = _make_meeting(self.project)
        # Add both as accepted participants so notifications are sent
        ParticipantLink.objects.create(
            meeting=self.meeting, user=self.user, is_accepted=True
        )
        ParticipantLink.objects.create(
            meeting=self.meeting, user=self.other_user, is_accepted=True
        )
        self.client.force_authenticate(user=self.user)

    def _url(self, suffix=""):
        return (
            f"/api/projects/{self.project.slug}"
            f"/meetings/{self.meeting.slug}/artifacts/{suffix}"
        )

    def test_list_artifacts_empty(self):
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        items = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertEqual(items, [])

    def test_create_artifact_link(self):
        res = self.client.post(
            self._url(),
            {"artifact_type": "task", "artifact_id": 999},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            ArtifactLink.objects.filter(
                meeting=self.meeting, artifact_type="task", artifact_id=999
            ).exists()
        )

    def test_create_artifact_link_unknown_type_uses_fallback_title(self):
        """For unknown artifact types the title fallback ('XyzType #id') shouldn't crash."""
        res = self.client.post(
            self._url(),
            {"artifact_type": "xyztype", "artifact_id": 42},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            ArtifactLink.objects.filter(
                meeting=self.meeting, artifact_type="xyztype", artifact_id=42
            ).exists()
        )

    def test_destroy_artifact_link(self):
        link = ArtifactLink.objects.create(
            meeting=self.meeting, artifact_type="task", artifact_id=11
        )
        res = self.client.delete(self._url(f"{link.id}/"))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ArtifactLink.objects.filter(pk=link.id).exists())

    def test_list_artifacts_shows_created(self):
        ArtifactLink.objects.create(meeting=self.meeting, artifact_type="task", artifact_id=1)
        ArtifactLink.objects.create(meeting=self.meeting, artifact_type="decision", artifact_id=2)
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        items = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertEqual(len(items), 2)

    def test_non_member_cannot_access_artifacts(self):
        non_member = CustomUser.objects.create_user(
            email="al_nm@example.com", password="pw", username="al_nm"
        )
        self.client.force_authenticate(user=non_member)
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class TestMeetingActionItemCRUD(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Org AI", slug="org-ai-test")
        self.project = Project.objects.create(name="Project AI", organization=self.org)

        self.user = CustomUser.objects.create_user(
            email="ai_crud_user@example.com", password="pw", username="ai_crud_user"
        )
        ProjectMember.objects.create(user=self.user, project=self.project, is_active=True)

        self.meeting = _make_meeting(self.project, title="AI CRUD Meeting")
        self.client.force_authenticate(user=self.user)

    def _url(self, suffix=""):
        return (
            f"/api/projects/{self.project.slug}"
            f"/meetings/{self.meeting.slug}/action-items/{suffix}"
        )

    def test_list_action_items_empty(self):
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        items = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertEqual(items, [])

    def test_create_action_item(self):
        res = self.client.post(
            self._url(),
            {"title": "Follow up with team", "description": "Send email", "order_index": 1},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["title"], "Follow up with team")
        self.assertFalse(res.data["is_resolved"])
        self.assertTrue(
            MeetingActionItem.objects.filter(meeting=self.meeting, title="Follow up with team").exists()
        )

    def test_retrieve_action_item(self):
        item = MeetingActionItem.objects.create(
            meeting=self.meeting, title="Retrieve me", order_index=0
        )
        res = self.client.get(self._url(f"{item.id}/"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], item.id)
        self.assertEqual(res.data["title"], "Retrieve me")

    def test_patch_action_item_title(self):
        item = MeetingActionItem.objects.create(
            meeting=self.meeting, title="Original title", order_index=0
        )
        res = self.client.patch(
            self._url(f"{item.id}/"), {"title": "Updated title"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertEqual(item.title, "Updated title")

    def test_patch_action_item_resolve(self):
        item = MeetingActionItem.objects.create(
            meeting=self.meeting, title="Resolve me", order_index=0
        )
        res = self.client.patch(
            self._url(f"{item.id}/"), {"is_resolved": True}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertTrue(item.is_resolved)

    def test_delete_action_item(self):
        item = MeetingActionItem.objects.create(
            meeting=self.meeting, title="Delete me", order_index=0
        )
        res = self.client.delete(self._url(f"{item.id}/"))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(MeetingActionItem.objects.filter(pk=item.id).exists())

    def test_list_action_items_ordered_by_order_index(self):
        MeetingActionItem.objects.create(meeting=self.meeting, title="B", order_index=2)
        MeetingActionItem.objects.create(meeting=self.meeting, title="A", order_index=1)
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        items = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["title"], "A")
        self.assertEqual(items[1]["title"], "B")

    def test_non_member_cannot_create_action_item(self):
        non_member = CustomUser.objects.create_user(
            email="ai_nm@example.com", password="pw", username="ai_nm"
        )
        self.client.force_authenticate(user=non_member)
        res = self.client.post(
            self._url(), {"title": "Should fail"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class TestMeetingAuditLogAPI(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Org Audit", slug="org-audit-test")
        self.project = Project.objects.create(name="Project Audit", organization=self.org)

        self.user = CustomUser.objects.create_user(
            email="audit_user@example.com", password="pw", username="audit_user"
        )
        ProjectMember.objects.create(user=self.user, project=self.project, is_active=True)

        self.meeting = _make_meeting(self.project, title="Audit Meeting")
        self.client.force_authenticate(user=self.user)

    def _url(self, suffix=""):
        return (
            f"/api/projects/{self.project.slug}"
            f"/meetings/{self.meeting.slug}/audit-log/{suffix}"
        )

    def test_list_audit_log_empty(self):
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        items = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertEqual(items, [])

    def test_list_audit_log_after_action_item_create(self):
        """Creating an action item via the API should generate an audit log entry."""
        action_items_url = (
            f"/api/projects/{self.project.slug}"
            f"/meetings/{self.meeting.slug}/action-items/"
        )
        self.client.post(
            action_items_url, {"title": "Audit tracked item"}, format="json"
        )
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        items = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertGreater(len(items), 0)
        event_types = [entry["event_type"] for entry in items]
        self.assertIn(MeetingAuditLog.EVENT_ACTION_ITEM_ADDED, event_types)

    def test_audit_log_is_read_only(self):
        """POST to audit-log should not be allowed (ReadOnlyModelViewSet)."""
        res = self.client.post(
            self._url(),
            {"event_type": "meeting.status_changed"},
            format="json",
        )
        self.assertIn(
            res.status_code,
            [status.HTTP_405_METHOD_NOT_ALLOWED, status.HTTP_403_FORBIDDEN],
        )

    def test_non_member_cannot_access_audit_log(self):
        non_member = CustomUser.objects.create_user(
            email="audit_nm@example.com", password="pw", username="audit_nm"
        )
        self.client.force_authenticate(user=non_member)
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
