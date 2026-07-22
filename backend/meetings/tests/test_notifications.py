"""
Integration tests: verify that the SSE Redis-publish chain is triggered
when meetings and tasks are created or updated via the API.

Focus
-----
We patch ``notifications.sse.publish_notification_to_redis`` – the final
function that writes to Redis – and assert it is called with the expected
recipient_id and notification object.  This exercises the entire chain:

    View → create_notification() → _push_notification_to_redis()
                                 → publish_notification_to_redis()

No real Redis connection is made.
"""

from unittest.mock import call, patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import CustomUser, Organization, Project, ProjectMember
from meetings.models import Meeting, MeetingDocument, MeetingTypeDefinition, ParticipantLink
from meetings.services import update_meeting_document_content
from notifications.models import NotificationEventType

# The exact symbol patched – must match the import path in services.py.
_PUBLISH_PATH = "notifications.sse.publish_notification_to_redis"

# Prevent slack signal's _get_connection() from switching the DB search_path
# to the tenant schema mid-request.  Its finally-block runs unconditionally
# and causes subsequent ORM saves to target the wrong schema, resulting in
# "Save with update_fields did not affect any rows" (TaskNotificationSSETests)
# or DEFERRABLE FK violations in _post_teardown.
_SLACK_GET_CONNECTION_PATH = "slack_integration.signals._get_connection"


class MeetingNotificationSSETests(TestCase):
    """
    Verify that creating / updating a meeting triggers SSE Redis publishes for
    each affected participant.
    """

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="TestOrg", slug="testorg")

        self.project = Project.objects.create(name="TestProject", organization=self.org)

        # user_a is the meeting organiser (authenticated caller).
        self.user_a = CustomUser.objects.create_user(
            email="organiser@example.com",
            password="pass12345",
            username="organiser",
        )
        ProjectMember.objects.create(
            user=self.user_a, project=self.project, is_active=True
        )

        # user_b is an invited participant who should receive notifications.
        self.user_b = CustomUser.objects.create_user(
            email="participant@example.com",
            password="pass12345",
            username="participant",
        )
        ProjectMember.objects.create(
            user=self.user_b, project=self.project, is_active=True
        )

        self.client.force_authenticate(user=self.user_a)

    def _meeting_type(self, *, slug: str = "planning"):
        obj, _ = MeetingTypeDefinition.objects.get_or_create(
            project=self.project,
            slug=slug,
            defaults={"label": slug},
        )
        return obj

    # ── create ───────────────────────────────────────────────────────────────

    @patch(_PUBLISH_PATH)
    def test_create_meeting_with_participants_fires_redis_publish(self, mock_publish):
        """
        POST /api/projects/{id}/meetings/ with participant_user_ids must call
        publish_notification_to_redis for each participant (except the creator).
        """
        url = f"/api/projects/{self.project.slug}/meetings/"
        payload = {
            "title": "Kickoff",
            "meeting_type": "planning",
            "objective": "Kick off the project",
            "participant_user_ids": [self.user_b.id],
        }

        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post(url, payload, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)

        # publish must have been called at least once for user_b.
        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(
            self.user_b.id,
            recipient_ids,
            "user_b (participant) must receive an SSE push",
        )
        # The creator should NOT receive their own notification.
        self.assertNotIn(
            self.user_a.id,
            recipient_ids,
            "user_a (creator) must not receive a self-notification",
        )

    @patch(_PUBLISH_PATH)
    def test_create_meeting_without_participants_does_not_fire_publish(self, mock_publish):
        """Creating a meeting with no participants → no SSE push."""
        url = f"/api/projects/{self.project.slug}/meetings/"
        payload = {
            "title": "Solo planning",
            "meeting_type": "solo",
            "objective": "Solo session",
        }
        r = self.client.post(url, payload, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        mock_publish.assert_not_called()

    # ── participant added ─────────────────────────────────────────────────────

    @patch(_PUBLISH_PATH)
    def test_adding_participant_fires_redis_publish(self, mock_publish):
        """
        POST /participants/ (ParticipantLinkViewSet) for a new user must call
        publish_notification_to_redis for that user.
        """
        meeting = Meeting.objects.create(
            project=self.project,
            title="Planning",
            type_definition=self._meeting_type(slug="link-test"),
        )
        url = f"/api/projects/{self.project.slug}/meetings/{meeting.slug}/participants/"
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post(url, {"user": self.user_b.id}, format="json")
        self.assertIn(r.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])

        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(self.user_b.id, recipient_ids)

    # ── participant removed ───────────────────────────────────────────────────

    @patch(_PUBLISH_PATH)
    def test_removing_participant_fires_redis_publish(self, mock_publish):
        """
        DELETE /participants/{pk}/ must call publish_notification_to_redis for
        the removed user (MEETING_PARTICIPANT_REMOVED) and must NOT notify the
        actor who performed the removal.
        """
        meeting = Meeting.objects.create(
            project=self.project,
            title="Sprint Review",
            type_definition=self._meeting_type(slug="sprint"),
        )
        link = ParticipantLink.objects.create(meeting=meeting, user=self.user_b)

        url = f"/api/projects/{self.project.slug}/meetings/{meeting.slug}/participants/{link.id}/"
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.delete(url)
        self.assertEqual(r.status_code, status.HTTP_204_NO_CONTENT)

        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(
            self.user_b.id,
            recipient_ids,
            "removed user (user_b) must receive MEETING_PARTICIPANT_REMOVED SSE push",
        )
        self.assertNotIn(
            self.user_a.id,
            recipient_ids,
            "actor (user_a) must not receive a self-notification",
        )

    @patch(_PUBLISH_PATH)
    def test_self_removal_does_not_fire_redis_publish(self, mock_publish):
        """
        When a user removes themselves from a meeting, no SSE notification
        should be sent (self-notification suppressed).
        """
        meeting = Meeting.objects.create(
            project=self.project,
            title="Standalone",
            type_definition=self._meeting_type(slug="standalone"),
        )
        link = ParticipantLink.objects.create(meeting=meeting, user=self.user_a)

        url = f"/api/projects/{self.project.slug}/meetings/{meeting.slug}/participants/{link.id}/"
        r = self.client.delete(url)
        self.assertEqual(r.status_code, status.HTTP_204_NO_CONTENT)
        mock_publish.assert_not_called()

    # ── update ───────────────────────────────────────────────────────────────

    @patch(_PUBLISH_PATH)
    def test_updating_meeting_time_fires_redis_publish_to_participants(self, mock_publish):
        """
        PATCH /api/projects/{id}/meetings/{id}/ with a changed scheduled_date
        must call publish_notification_to_redis for each participant.
        """
        meeting = Meeting.objects.create(
            project=self.project,
            title="Standup",
            type_definition=self._meeting_type(slug="standup"),
        )
        ParticipantLink.objects.create(meeting=meeting, user=self.user_b, is_accepted=True)

        url = f"/api/projects/{self.project.slug}/meetings/{meeting.slug}/"
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.patch(
                url,
                {"scheduled_date": "2099-12-31"},
                format="json",
            )
        self.assertEqual(r.status_code, status.HTTP_200_OK)

        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(self.user_b.id, recipient_ids)

    @patch(_PUBLISH_PATH)
    def test_updating_meeting_location_fires_redis_publish(self, mock_publish):
        """
        Changing external_reference (location) on PATCH must trigger an SSE
        push with old_location / new_location metadata.
        """
        meeting = Meeting.objects.create(
            project=self.project,
            title="Design Review",
            type_definition=self._meeting_type(slug="design"),
            external_reference="Room A",
        )
        ParticipantLink.objects.create(meeting=meeting, user=self.user_b, is_accepted=True)

        url = f"/api/projects/{self.project.slug}/meetings/{meeting.slug}/"
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.patch(
                url,
                {"external_reference": "Room B"},
                format="json",
            )
        self.assertEqual(r.status_code, status.HTTP_200_OK)

        mock_publish.assert_called()
        # Verify the notification carries location diff metadata.
        notif_args = [c[0][1] for c in mock_publish.call_args_list]
        location_notifs = [
            n for n in notif_args
            if n.metadata.get("old_location") is not None
            or n.metadata.get("new_location") is not None
        ]
        self.assertTrue(
            len(location_notifs) >= 1,
            "At least one notification must carry location change metadata",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Task SSE integration tests
# ─────────────────────────────────────────────────────────────────────────────

class TaskNotificationSSETests(TestCase):
    """
    Verify that creating / updating a task triggers SSE Redis publishes.
    """

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="TaskOrg", slug="taskorg")
        self.project = Project.objects.create(name="TaskProject", organization=self.org)

        self.creator = CustomUser.objects.create_user(
            email="creator@example.com", password="pass12345", username="creator"
        )
        ProjectMember.objects.create(
            user=self.creator, project=self.project, is_active=True
        )

        self.owner = CustomUser.objects.create_user(
            email="owner@example.com", password="pass12345", username="owner"
        )
        ProjectMember.objects.create(
            user=self.owner, project=self.project, is_active=True
        )

        self.client.force_authenticate(user=self.creator)

        # Prevent slack signal's _get_connection() from contaminating the DB
        # search_path mid-request.  task/views.py calls task.save(update_fields=...)
        # after serializer.save(); if the slack signal fires in between and changes
        # search_path to org_taskorg, that second save raises DatabaseError.
        _slack_patcher = patch(_SLACK_GET_CONNECTION_PATH, return_value=None)
        _slack_patcher.start()
        self.addCleanup(_slack_patcher.stop)

    # ── create ───────────────────────────────────────────────────────────────

    @patch(_PUBLISH_PATH)
    def test_task_create_with_owner_fires_redis_publish(self, mock_publish):
        """
        POST /api/tasks/ with owner_id must call publish_notification_to_redis
        for the assigned owner (TASK_ASSIGNED).
        """
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post(
                "/api/tasks/",
                {
                    "summary": "Implement login",
                    "type": "execution",
                    "project_id": self.project.id,
                    "owner_id": self.owner.id,
                    "current_approver_id": self.owner.id,
                },
                format="json",
            )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)

        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(
            self.owner.id,
            recipient_ids,
            "owner must receive TASK_ASSIGNED SSE push",
        )

    @patch(_PUBLISH_PATH)
    def test_task_create_without_owner_does_not_fire_publish(self, mock_publish):
        """Creating a task without owner or approver → no SSE publish."""
        r = self.client.post(
            "/api/tasks/",
            {
                "summary": "Unassigned task",
                "type": "execution",
                "project_id": self.project.id,
                "create_as_draft": True,
            },
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        mock_publish.assert_not_called()

    # ── update ───────────────────────────────────────────────────────────────

    @patch(_PUBLISH_PATH)
    def test_task_update_owner_change_fires_redis_publish(self, mock_publish):
        """
        PATCH /api/tasks/{pk}/ changing owner_id must call
        publish_notification_to_redis for the new owner (TASK_OWNER_CHANGED).
        """
        # Create a task as draft (so owner_id can be changed later).
        r_create = self.client.post(
            "/api/tasks/",
            {
                "summary": "Re-assignable task",
                "type": "execution",
                "project_id": self.project.id,
                "create_as_draft": True,
            },
            format="json",
        )
        self.assertEqual(r_create.status_code, status.HTTP_201_CREATED)
        task_slug = r_create.data["slug"]

        mock_publish.reset_mock()  # clear any calls from create

        # Reassign to owner (allowed while in DRAFT status).
        with self.captureOnCommitCallbacks(execute=True):
            r_update = self.client.patch(
                f"/api/tasks/{task_slug}/",
                {"owner_id": self.owner.id},
                format="json",
            )
        self.assertEqual(r_update.status_code, status.HTTP_200_OK)

        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(self.owner.id, recipient_ids)

    @patch(_PUBLISH_PATH)
    def test_task_update_due_date_change_fires_redis_publish(self, mock_publish):
        """
        PATCH /api/tasks/{pk}/ changing due_date must call
        publish_notification_to_redis for the owner (TASK_DEADLINE_SOON)
        and include old_due_date / new_due_date metadata.
        """
        from task.models import Task

        # Create a task as draft first, then set up owner properly.
        r_create = self.client.post(
            "/api/tasks/",
            {
                "summary": "Deadline task",
                "type": "execution",
                "project_id": self.project.id,
                "create_as_draft": True,
            },
            format="json",
        )
        self.assertEqual(r_create.status_code, status.HTTP_201_CREATED)
        task_id = r_create.data["id"]

        # Set owner to self.owner (different from creator) and mark as accepted.
        # Also set creator as approver so they can update the task.
        task = Task.objects.get(pk=task_id)
        task.owner = self.owner
        task.owner_invite_pending = False
        task.current_approver = self.creator
        task.approver_invite_pending = False
        task.save(update_fields=["owner", "owner_invite_pending", "current_approver", "approver_invite_pending"])

        mock_publish.reset_mock()

        # Change the due date (creator/approver → owner notification expected).
        with self.captureOnCommitCallbacks(execute=True):
            r_update = self.client.patch(
                f"/api/tasks/{task.slug}/",
                {"due_date": "2099-06-30"},
                format="json",
            )
        self.assertEqual(r_update.status_code, status.HTTP_200_OK)

        mock_publish.assert_called()
        # Verify the notification carries the deadline diff metadata.
        notif_args = [c[0][1] for c in mock_publish.call_args_list]
        deadline_notifs = [
            n for n in notif_args
            if n.metadata.get("change_type") == "task_due_date"
        ]
        self.assertTrue(
            len(deadline_notifs) >= 1,
            "At least one notification must carry task_due_date change_type",
        )
        self.assertEqual(deadline_notifs[0].metadata["new_value"], "2099-06-30")


# ─────────────────────────────────────────────────────────────────────────────
# Agenda section-title & agenda-item dedup notification tests
# ─────────────────────────────────────────────────────────────────────────────

class AgendaSectionNotificationTests(TestCase):
    """
    Verify that renaming a section title fires a ``MEETING_UPDATED`` SSE push,
    including the edge-case of sections that have NO items (previously invisible
    to the item-level diff loop).
    """

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="SectionOrg", slug="sectionorg")
        self.project = Project.objects.create(name="SectionProject", organization=self.org)

        self.organiser = CustomUser.objects.create_user(
            email="sec_organiser@example.com", password="pass12345", username="sec_organiser"
        )
        self.participant = CustomUser.objects.create_user(
            email="sec_participant@example.com", password="pass12345", username="sec_participant"
        )
        ProjectMember.objects.create(user=self.organiser, project=self.project, is_active=True)
        ProjectMember.objects.create(user=self.participant, project=self.project, is_active=True)

        self.mtd, _ = MeetingTypeDefinition.objects.get_or_create(
            project=self.project, slug="weekly", defaults={"label": "Weekly"}
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Section Test Meeting",
            type_definition=self.mtd,
        )
        ParticipantLink.objects.create(meeting=self.meeting, user=self.organiser, is_accepted=True)
        ParticipantLink.objects.create(meeting=self.meeting, user=self.participant, is_accepted=True)

        self.client.force_authenticate(user=self.organiser)

    def _patch_layout(self, layout_config):
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/"
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.patch(url, {"layout_config": layout_config}, format="json")
        return r

    @patch(_PUBLISH_PATH)
    def test_renaming_section_with_items_fires_notification(self, mock_publish):
        """Section rename when section contains items triggers MEETING_UPDATED."""
        # Pre-seed layout_config directly on the model (bypasses serializer → avoids
        # a double-PATCH test setup that exercises unrelated serializer logic).
        self.meeting.layout_config = {
            "blocks": [{"id": "agenda", "type": "agenda"}],
            "nestedSections": [
                {"id": "sec-1", "title": "Old Title", "items": [{"id": "1001", "text": "Item A"}]},
            ],
        }
        self.meeting.save(update_fields=["layout_config"])

        renamed_layout = {
            "blocks": [{"id": "agenda", "type": "agenda"}],
            "nestedSections": [
                {"id": "sec-1", "title": "New Title", "items": [{"id": "1001", "text": "Item A"}]},
            ],
        }
        r = self._patch_layout(renamed_layout)
        self.assertEqual(r.status_code, status.HTTP_200_OK)

        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(self.participant.id, recipient_ids)
        self.assertNotIn(self.organiser.id, recipient_ids)

    @patch(_PUBLISH_PATH)
    def test_renaming_empty_section_fires_notification(self, mock_publish):
        """
        Section rename when the section has NO items must still fire a
        notification (regression: item-level loop was blind to empty sections).
        """
        self.meeting.layout_config = {
            "blocks": [{"id": "agenda", "type": "agenda"}],
            "nestedSections": [{"id": "sec-empty", "title": "Old Empty", "items": []}],
        }
        self.meeting.save(update_fields=["layout_config"])

        r = self._patch_layout({
            "blocks": [{"id": "agenda", "type": "agenda"}],
            "nestedSections": [{"id": "sec-empty", "title": "New Empty", "items": []}],
        })
        self.assertEqual(r.status_code, status.HTTP_200_OK)

        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(
            self.participant.id,
            recipient_ids,
            "participant must receive notification even when the renamed section is empty",
        )

    @patch(_PUBLISH_PATH)
    def test_section_rename_notification_carries_old_and_new_title_metadata(self, mock_publish):
        """Metadata must contain old_agenda and new_agenda showing the section rename."""
        self.meeting.layout_config = {
            "blocks": [{"id": "agenda", "type": "agenda"}],
            "nestedSections": [{"id": "sec-meta", "title": "Before", "items": []}],
        }
        self.meeting.save(update_fields=["layout_config"])

        self._patch_layout({
            "blocks": [{"id": "agenda", "type": "agenda"}],
            "nestedSections": [{"id": "sec-meta", "title": "After", "items": []}],
        })

        notif_objects = [c[0][1] for c in mock_publish.call_args_list]
        self.assertTrue(len(notif_objects) >= 1)
        meta = notif_objects[0].metadata
        # Backend now stores the plain title (no "Section: " prefix);
        # the "Section: " prefix stripping happens on the frontend only.
        self.assertIn("Before", meta.get("old_agenda", ""))
        self.assertIn("After", meta.get("new_agenda", ""))

    @patch(_PUBLISH_PATH)
    def test_unchanged_section_title_does_not_fire_notification(self, mock_publish):
        """Patching layout_config without actually renaming a section → no notification."""
        layout = {
            "blocks": [{"id": "agenda", "type": "agenda"}],
            "nestedSections": [
                {"id": "sec-same", "title": "Stable", "items": [{"id": "1002", "text": "x"}]},
            ],
        }
        self.meeting.layout_config = layout
        self.meeting.save(update_fields=["layout_config"])

        # Patch with identical layout
        r = self._patch_layout(layout)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        mock_publish.assert_not_called()


class AgendaItemDedupNotificationTests(TestCase):
    """
    Verify the 2-second dedup window for agenda-item notifications (now MEETING_UPDATED):
    - Rapid successive updates to the same item produce exactly ONE DB notification.
    - The notification preserves the original ``old_agenda`` while always showing
      the latest ``new_agenda``.
    - Whitespace-only changes are ignored.
    """

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="DedupOrg", slug="deduporg")
        self.project = Project.objects.create(name="DedupProject", organization=self.org)

        self.editor = CustomUser.objects.create_user(
            email="dedup_editor@example.com", password="pass12345", username="dedup_editor"
        )
        self.watcher = CustomUser.objects.create_user(
            email="dedup_watcher@example.com", password="pass12345", username="dedup_watcher"
        )
        ProjectMember.objects.create(user=self.editor, project=self.project, is_active=True)
        ProjectMember.objects.create(user=self.watcher, project=self.project, is_active=True)

        self.mtd, _ = MeetingTypeDefinition.objects.get_or_create(
            project=self.project, slug="dedup-meeting", defaults={"label": "Dedup Meeting"}
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Dedup Meeting",
            type_definition=self.mtd,
        )
        ParticipantLink.objects.create(meeting=self.meeting, user=self.editor, is_accepted=True)
        ParticipantLink.objects.create(meeting=self.meeting, user=self.watcher, is_accepted=True)

        self.client.force_authenticate(user=self.editor)

        # Create one agenda item via API
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/agenda-items/"
        r = self.client.post(url, {"content": "Original text", "order_index": 0}, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.agenda_item_id = r.data["id"]

    def _patch_item(self, content):
        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/agenda-items/{self.agenda_item_id}/"
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.patch(url, {"content": content}, format="json")
        return r

    @patch(_PUBLISH_PATH)
    def test_single_update_fires_exactly_one_notification(self, mock_publish):
        """One PATCH → one SSE push to the watcher."""
        # Reset mock to ignore the CREATE notification from setUp
        mock_publish.reset_mock()

        r = self._patch_item("Updated text")
        self.assertEqual(r.status_code, status.HTTP_200_OK)

        calls_for_watcher = [c for c in mock_publish.call_args_list if c[0][0] == self.watcher.id]
        self.assertEqual(len(calls_for_watcher), 1, "Exactly one SSE push per single update")

    @patch(_PUBLISH_PATH)
    def test_whitespace_only_change_does_not_fire_notification(self, mock_publish):
        """Changing content to add/remove only whitespace must not fire a notification."""
        # Set initial content
        self._patch_item("No trailing space")
        mock_publish.reset_mock()

        # Re-submit with trailing space only
        r = self._patch_item("No trailing space   ")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        mock_publish.assert_not_called()

    @patch(_PUBLISH_PATH)
    def test_rapid_updates_coalesce_into_one_notification_with_latest_content(self, mock_publish):
        """
        The upsert helper: two calls within the 2-second dedup window must
        produce exactly ONE DB Notification row; ``new_agenda`` reflects the
        latest edit while ``old_agenda`` is preserved from the first call.

        We use a real in-memory dict as the cache store so this test is not
        affected by Django test framework / CacheHandler lifecycle quirks.
        """
        from unittest.mock import patch as _patch
        from meetings.services import upsert_agenda_item_notification
        from notifications.models import Notification

        # Simulate a shared in-memory cache backed by a plain dict
        _store: dict = {}

        class _FakeCache:
            def get(self, key, default=None):
                return _store.get(key, default)

            def set(self, key, value, timeout=None):
                _store[key] = value

            def add(self, key, value, timeout=None):
                """Atomic set-if-absent; returns True when the key was new."""
                if key in _store:
                    return False
                _store[key] = value
                return True

        fake_cache = _FakeCache()

        # Patch the module-level ``django_cache`` reference used by
        # ``upsert_agenda_item_notification`` so both calls share the fake store.
        with _patch("meetings.services.django_cache", fake_cache):
            upsert_agenda_item_notification(
                meeting=self.meeting,
                item_id=self.agenda_item_id,
                old_content="Original text",
                new_content="Intermediate",
                actor_id=self.editor.id,
                recipient_id=self.watcher.id,
            )
            upsert_agenda_item_notification(
                meeting=self.meeting,
                item_id=self.agenda_item_id,
                old_content="Intermediate",
                new_content="Final version",
                actor_id=self.editor.id,
                recipient_id=self.watcher.id,
            )

        # Only ONE "modified" DB Notification row should exist (now uses MEETING_UPDATED,
        # change_type="agenda_item" — distinct from the "agenda_item_create" record that
        # setUp produces when it POSTs the initial agenda item).
        notifs = Notification.objects.filter(
            recipient=self.watcher,
            actor=self.editor,
            event_type=NotificationEventType.MEETING_UPDATED,
            related_object_id=str(self.meeting.id),
            body="Meeting details were changed.",
            metadata__change_type="agenda_item",
        )
        self.assertEqual(
            notifs.count(), 1, "Two rapid edits must produce exactly one notification record"
        )
        n = notifs.first()
        self.assertEqual(n.metadata.get("old_agenda"), "Original text",
                         "old_agenda must preserve the pre-edit-session value")
        self.assertEqual(n.metadata.get("new_agenda"), "Final version",
                         "new_agenda must reflect the most recent edit")


# ─────────────────────────────────────────────────────────────────────────────
# Agenda-item create / delete notification tests
# ─────────────────────────────────────────────────────────────────────────────

class AgendaItemCreateDeleteNotificationTests(TestCase):
    """
    Verify that creating and deleting an AgendaItem fires exactly ONE
    MEETING_UPDATED notification (not the old MEETING_AGENDA_CHANGED type)
    with the correct change_type and content metadata.
    """

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="CrudOrg", slug="crudorg")
        self.project = Project.objects.create(name="CrudProject", organization=self.org)

        self.actor = CustomUser.objects.create_user(
            email="crud_actor@example.com", password="pass12345", username="crud_actor"
        )
        self.watcher = CustomUser.objects.create_user(
            email="crud_watcher@example.com", password="pass12345", username="crud_watcher"
        )
        ProjectMember.objects.create(user=self.actor, project=self.project, is_active=True)
        ProjectMember.objects.create(user=self.watcher, project=self.project, is_active=True)

        self.mtd, _ = MeetingTypeDefinition.objects.get_or_create(
            project=self.project, slug="crud-meeting", defaults={"label": "Crud Meeting"}
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Crud Meeting",
            type_definition=self.mtd,
        )
        ParticipantLink.objects.create(meeting=self.meeting, user=self.actor, is_accepted=True)
        ParticipantLink.objects.create(meeting=self.meeting, user=self.watcher, is_accepted=True)

        self.client.force_authenticate(user=self.actor)
        self.items_url = (
            f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/agenda-items/"
        )

    @patch(_PUBLISH_PATH)
    def test_create_item_fires_meeting_updated_notification(self, mock_publish):
        """POST /agenda-items/ must fire MEETING_UPDATED with change_type='agenda_item_create'."""
        from notifications.models import Notification

        r = self.client.post(self.items_url, {"content": "New items", "order_index": 0}, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)

        notif = Notification.objects.filter(
            recipient=self.watcher,
            actor=self.actor,
            event_type=NotificationEventType.MEETING_UPDATED,
            related_object_id=str(self.meeting.id),
        ).first()
        self.assertIsNotNone(notif, "A MEETING_UPDATED notification must exist for the watcher")
        self.assertEqual(notif.metadata.get("change_type"), "agenda_item_create")
        self.assertEqual(notif.metadata.get("new_agenda"), "New items")
        self.assertIsNone(notif.metadata.get("old_agenda"), "Create notification must have no old_agenda")

    @patch(_PUBLISH_PATH)
    def test_delete_item_fires_meeting_updated_notification(self, mock_publish):
        """DELETE /agenda-items/{pk}/ must fire MEETING_UPDATED with change_type='agenda_item_delete'."""
        from notifications.models import Notification

        # Create the item first (silently — reset mock and Notification table after).
        r = self.client.post(self.items_url, {"content": "Item to delete", "order_index": 0}, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        item_id = r.data["id"]
        mock_publish.reset_mock()
        from notifications.models import Notification as _N
        _N.objects.all().delete()  # clear so the delete notification is the only one left

        # No cache.clear() needed: per-item cache key for delete != create key.
        delete_url = f"{self.items_url}{item_id}/"
        r = self.client.delete(delete_url)
        self.assertEqual(r.status_code, status.HTTP_204_NO_CONTENT)

        notif = Notification.objects.filter(
            recipient=self.watcher,
            actor=self.actor,
            event_type=NotificationEventType.MEETING_UPDATED,
            related_object_id=str(self.meeting.id),
        ).order_by("-created_at").first()
        self.assertIsNotNone(notif, "A MEETING_UPDATED notification must exist after deletion")
        self.assertEqual(notif.metadata.get("change_type"), "agenda_item_delete")
        self.assertEqual(notif.metadata.get("old_agenda"), "Item to delete")
        self.assertIsNone(notif.metadata.get("new_agenda"), "Delete notification must have no new_agenda")

    @patch(_PUBLISH_PATH)
    def test_create_item_does_not_notify_actor(self, mock_publish):
        """The actor who creates the item must NOT receive a notification."""
        from notifications.models import Notification

        self.client.post(self.items_url, {"content": "Self-created item", "order_index": 0}, format="json")

        self_notif = Notification.objects.filter(
            recipient=self.actor,
            event_type=NotificationEventType.MEETING_UPDATED,
            related_object_id=str(self.meeting.id),
        ).first()
        self.assertIsNone(self_notif, "Actor must not receive a notification for their own creation")

    @patch(_PUBLISH_PATH)
    def test_pending_participant_does_not_receive_agenda_update_notification(self, mock_publish):
        """Invitees who have not accepted must not receive meeting update notifications."""
        from notifications.models import Notification

        pending_user = CustomUser.objects.create_user(
            email="pending@example.com", password="pass12345", username="pending_user"
        )
        ProjectMember.objects.create(user=pending_user, project=self.project, is_active=True)
        ParticipantLink.objects.create(
            meeting=self.meeting,
            user=pending_user,
            is_accepted=False,
        )

        item = self.meeting.agenda_items.create(content="Initial", order_index=99)
        patch_url = f"{self.items_url}{item.id}/"
        r = self.client.patch(patch_url, {"content": "Changed by organiser"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)

        pending_notif = Notification.objects.filter(
            recipient=pending_user,
            event_type=NotificationEventType.MEETING_UPDATED,
            related_object_id=str(self.meeting.id),
        ).exists()
        self.assertFalse(
            pending_notif,
            "Pending (not accepted) participants must not receive meeting update notifications",
        )

        accepted_notif = Notification.objects.filter(
            recipient=self.watcher,
            event_type=NotificationEventType.MEETING_UPDATED,
            related_object_id=str(self.meeting.id),
        ).exists()
        self.assertTrue(
            accepted_notif,
            "Accepted participants should still receive meeting update notifications",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Meeting document (collaborative notes) SSE integration tests
# ─────────────────────────────────────────────────────────────────────────────

class MeetingDocumentNotificationTests(TestCase):
    """
    Verify that editing meeting collaborative notes (Doc Asset) triggers an
    SSE Redis publish to all meeting participants except the editor.

    Both trigger paths are covered:
      • HTTP PATCH  /api/projects/{id}/meetings/{id}/document/  (views.py)
      • Direct service call with notify_collaborators=True       (services.py)
    """

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="DocOrg", slug="docorg")
        self.project = Project.objects.create(name="DocProject", organization=self.org)

        self.editor = CustomUser.objects.create_user(
            email="editor@example.com", password="pass12345", username="editor"
        )
        self.reader = CustomUser.objects.create_user(
            email="reader@example.com", password="pass12345", username="reader"
        )
        ProjectMember.objects.create(user=self.editor, project=self.project, is_active=True)
        ProjectMember.objects.create(user=self.reader, project=self.project, is_active=True)

        self.meeting_type, _ = MeetingTypeDefinition.objects.get_or_create(
            project=self.project,
            slug="collab",
            defaults={"label": "Collab"},
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Collab Notes Meeting",
            type_definition=self.meeting_type,
        )
        ParticipantLink.objects.create(meeting=self.meeting, user=self.editor, is_accepted=True)
        ParticipantLink.objects.create(meeting=self.meeting, user=self.reader, is_accepted=True)

        self.client.force_authenticate(user=self.editor)

    # ── HTTP PATCH path ───────────────────────────────────────────────────────

    @patch(_PUBLISH_PATH)
    def test_http_patch_doc_fires_publish_to_other_participants(self, mock_publish):
        """
        PATCH /document/ must publish DOC_ASSET_UPDATE to every participant
        except the editor; metadata must include meeting_title and asset_id.
        """
        # Seed initial content without triggering a notification.
        update_meeting_document_content(
            meeting_id=self.meeting.id,
            content="Initial draft",
            user_id=self.editor.id,
            notify_collaborators=False,
        )

        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/document/"
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.patch(url, {"content": "Updated draft by editor"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)

        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]

        # reader must receive the notification
        self.assertIn(self.reader.id, recipient_ids, "reader must receive DOC_ASSET_UPDATE")
        # editor must NOT receive a self-notification
        self.assertNotIn(self.editor.id, recipient_ids, "editor must not receive self-notification")

        # Verify event type
        notif_objects = [c[0][1] for c in mock_publish.call_args_list]
        doc_notifs = [n for n in notif_objects if n.event_type == NotificationEventType.DOC_ASSET_UPDATE]
        self.assertTrue(len(doc_notifs) >= 1, "At least one DOC_ASSET_UPDATE notification must be sent")

        # Verify required metadata keys
        meta = doc_notifs[0].metadata
        self.assertEqual(meta.get("meeting_id"), self.meeting.id)
        self.assertEqual(meta.get("meeting_title"), self.meeting.title)
        self.assertIn("asset_id", meta, "metadata must include asset_id (document pk)")
        doc = MeetingDocument.objects.get(meeting=self.meeting)
        self.assertEqual(meta["asset_id"], doc.id)

    @patch(_PUBLISH_PATH)
    def test_http_patch_doc_unchanged_content_does_not_fire_publish(self, mock_publish):
        """
        PATCH /document/ with the same content must NOT trigger a notification
        (no-op guard in notify_participants_meeting_document_updated).
        """
        update_meeting_document_content(
            meeting_id=self.meeting.id,
            content="Identical content",
            user_id=self.editor.id,
            notify_collaborators=False,
        )

        url = f"/api/projects/{self.project.slug}/meetings/{self.meeting.slug}/document/"
        r = self.client.patch(url, {"content": "Identical content"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        mock_publish.assert_not_called()

    # ── Service layer path ────────────────────────────────────────────────────

    @patch(_PUBLISH_PATH)
    def test_service_notify_collaborators_fires_publish(self, mock_publish):
        """
        Calling update_meeting_document_content(notify_collaborators=True)
        directly must publish DOC_ASSET_UPDATE to other participants and
        include meeting_title + asset_id in metadata.
        """
        update_meeting_document_content(
            meeting_id=self.meeting.id,
            content="Seed content",
            user_id=self.editor.id,
            notify_collaborators=False,
        )

        with self.captureOnCommitCallbacks(execute=True):
            update_meeting_document_content(
                meeting_id=self.meeting.id,
                content="New content via service",
                user_id=self.editor.id,
                notify_collaborators=True,
            )

        mock_publish.assert_called()
        recipient_ids = [c[0][0] for c in mock_publish.call_args_list]
        self.assertIn(self.reader.id, recipient_ids)
        self.assertNotIn(self.editor.id, recipient_ids)

        notif_objects = [c[0][1] for c in mock_publish.call_args_list]
        meta = notif_objects[0].metadata
        self.assertIn("meeting_title", meta)
        self.assertIn("asset_id", meta)

    @patch(_PUBLISH_PATH)
    def test_service_without_notify_flag_does_not_fire_publish(self, mock_publish):
        """
        update_meeting_document_content without notify_collaborators=True (the
        WebSocket yjs_update path) must NOT trigger SSE notifications.
        """
        update_meeting_document_content(
            meeting_id=self.meeting.id,
            content="Content via ws yjs path",
            user_id=self.editor.id,
            # notify_collaborators defaults to False
        )
        mock_publish.assert_not_called()
