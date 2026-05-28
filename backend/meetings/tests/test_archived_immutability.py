from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient
from django.test import TestCase

from core.models import Organization, Project, ProjectMember, CustomUser
from meetings.models import (
    Meeting,
    AgendaItem,
    ParticipantLink,
    ArtifactLink,
    MeetingActionItem,
)
from meetings.services import create_agenda_item, ensure_meeting_type_definition


def _meeting(project, **kwargs):
    type_def = ensure_meeting_type_definition(project, "planning")
    defaults = dict(title="Test Meeting", type_definition=type_def, objective="Some objective")
    defaults.update(kwargs)
    return Meeting.objects.create(project=project, **defaults)


class TestArchivedMeetingImmutability(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.organization = Organization.objects.create(name="Org", slug="org-arch-imm")
        self.project = Project.objects.create(name="Project", organization=self.organization)
        self.member = CustomUser.objects.create_user(
            email="member_arch@example.com", password="pw", username="member_arch"
        )
        ProjectMember.objects.create(user=self.member, project=self.project, is_active=True)
        self.client.force_authenticate(user=self.member)
        self.meeting = _meeting(
            self.project, status=Meeting.STATUS_ARCHIVED, is_archived=True
        )

    def _url(self, path):
        return f"/api/projects/{self.project.id}/meetings/{self.meeting.id}{path}"

    # ------------------------------------------------------------------
    # Meeting-level writes → 403
    # ------------------------------------------------------------------

    def test_patch_meeting_title_blocked(self):
        res = self.client.patch(self._url("/"), {"title": "New Title"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("read-only", res.data["detail"].lower())

    def test_patch_meeting_objective_blocked(self):
        res = self.client.patch(
            self._url("/"), {"objective": "New objective"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_patch_meeting_scheduled_date_blocked(self):
        res = self.client.patch(
            self._url("/"), {"scheduled_date": "2026-12-01"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_meeting_blocked(self):
        res = self.client.delete(self._url("/"))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # Agenda items → 403
    # ------------------------------------------------------------------

    def test_post_agenda_item_blocked(self):
        res = self.client.post(
            self._url("/agenda-items/"),
            {"content": "New item", "order_index": 0},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_patch_agenda_item_blocked(self):
        item = AgendaItem.objects.create(
            meeting=self.meeting, content="Existing", order_index=0
        )
        res = self.client.patch(
            self._url(f"/agenda-items/{item.id}/"),
            {"content": "Updated"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_agenda_item_blocked(self):
        item = AgendaItem.objects.create(
            meeting=self.meeting, content="Existing", order_index=0
        )
        res = self.client.delete(self._url(f"/agenda-items/{item.id}/"))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_reorder_agenda_items_blocked(self):
        item = AgendaItem.objects.create(
            meeting=self.meeting, content="Item", order_index=0
        )
        res = self.client.patch(
            self._url("/agenda-items/reorder/"),
            {"items": [{"id": item.id, "order_index": 0}]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # Participants → 403
    # ------------------------------------------------------------------

    def test_post_participant_blocked(self):
        res = self.client.post(
            self._url("/participants/"),
            {"user": self.member.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_participant_blocked(self):
        link = ParticipantLink.objects.create(meeting=self.meeting, user=self.member)
        res = self.client.delete(self._url(f"/participants/{link.id}/"))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # Artifacts → 403
    # ------------------------------------------------------------------

    def test_post_artifact_blocked(self):
        res = self.client.post(
            self._url("/artifacts/"),
            {"artifact_type": "decision", "artifact_id": 1},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_artifact_blocked(self):
        artifact = ArtifactLink.objects.create(
            meeting=self.meeting, artifact_type="decision", artifact_id=1
        )
        res = self.client.delete(self._url(f"/artifacts/{artifact.id}/"))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # Action items → 403
    # ------------------------------------------------------------------

    def test_post_action_item_blocked(self):
        res = self.client.post(
            self._url("/action-items/"),
            {"title": "Do it"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_patch_action_item_title_blocked(self):
        item = MeetingActionItem.objects.create(
            meeting=self.meeting, title="Old", description="", order_index=0
        )
        res = self.client.patch(
            self._url(f"/action-items/{item.id}/"),
            {"title": "New"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_patch_action_item_is_resolved_blocked(self):
        item = MeetingActionItem.objects.create(
            meeting=self.meeting, title="Old", description="", order_index=0
        )
        res = self.client.patch(
            self._url(f"/action-items/{item.id}/"),
            {"is_resolved": True},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_action_item_blocked(self):
        item = MeetingActionItem.objects.create(
            meeting=self.meeting, title="Item", description="", order_index=0
        )
        res = self.client.delete(self._url(f"/action-items/{item.id}/"))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_convert_action_item_to_task_blocked(self):
        item = MeetingActionItem.objects.create(
            meeting=self.meeting, title="Item", description="", order_index=0
        )
        res = self.client.post(
            self._url(f"/action-items/{item.id}/convert-to-task/"),
            {},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_bulk_convert_action_items_blocked(self):
        item = MeetingActionItem.objects.create(
            meeting=self.meeting, title="Item", description="", order_index=0
        )
        res = self.client.post(
            self._url("/action-items/bulk-convert-to-tasks/"),
            {"items": [{"action_item_id": item.id}]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # Document → 403
    # ------------------------------------------------------------------

    def test_patch_document_blocked(self):
        res = self.client.patch(
            self._url("/document/"),
            {"content": "New content"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # Reads are unaffected → 200
    # ------------------------------------------------------------------

    def test_get_meeting_detail_allowed(self):
        res = self.client.get(self._url("/"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_get_agenda_items_allowed(self):
        res = self.client.get(self._url("/agenda-items/"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_get_participants_allowed(self):
        res = self.client.get(self._url("/participants/"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_get_action_items_allowed(self):
        res = self.client.get(self._url("/action-items/"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_get_document_allowed(self):
        res = self.client.get(self._url("/document/"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # is_archived ↔ status sync
    # ------------------------------------------------------------------

    def test_transition_to_archived_sets_is_archived_atomically(self):
        # No action items → _validate_transition_to_archived passes (unresolved count == 0).
        meeting = _meeting(self.project, status=Meeting.STATUS_COMPLETED)
        self.assertEqual(meeting.action_items.filter(is_resolved=False).count(), 0)
        url = f"/api/projects/{self.project.id}/meetings/{meeting.id}/lifecycle/transition/"
        res = self.client.post(url, {"to_state": "archived"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        meeting.refresh_from_db()
        self.assertEqual(meeting.status, Meeting.STATUS_ARCHIVED)
        self.assertTrue(meeting.is_archived)

    def test_direct_patch_of_is_archived_is_ignored(self):
        meeting = _meeting(self.project, status=Meeting.STATUS_DRAFT)
        url = f"/api/projects/{self.project.id}/meetings/{meeting.id}/"
        res = self.client.patch(url, {"is_archived": True}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        meeting.refresh_from_db()
        self.assertFalse(meeting.is_archived)
        self.assertEqual(meeting.status, Meeting.STATUS_DRAFT)

    # ------------------------------------------------------------------
    # Service layer isolation (Layer 3 fires independently of HTTP stack)
    # ------------------------------------------------------------------

    def test_service_create_agenda_item_raises_permission_denied_on_archived(self):
        with self.assertRaises(PermissionDenied):
            create_agenda_item(
                meeting=self.meeting,
                content="Should not be created",
                order_index=0,
                is_priority=False,
                actor=self.member,
            )
