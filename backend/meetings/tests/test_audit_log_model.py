"""
Comprehensive tests for MeetingAuditLog model covering:
- Model creation with various field combinations
- Immutability enforcement via Postgres trigger
- Index verification
- JSON field serialization
"""

import json
from datetime import datetime
from uuid import uuid4

from django.db import connection, transaction
from django.db.utils import OperationalError
from django.test import TestCase

from core.models import Organization, Project, CustomUser
from meetings.models import Meeting, MeetingAuditLog, MeetingTypeDefinition


class TestMeetingAuditLogCreation(TestCase):
    """Test audit log entry creation with valid data."""

    def setUp(self):
        """Set up test fixtures."""
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.project = Project.objects.create(
            name="Test Project",
            organization=self.organization
        )
        self.type_def = MeetingTypeDefinition.objects.create(
            project=self.project,
            slug="planning",
            label="Planning Meeting"
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Test Meeting",
            type_definition=self.type_def,
            objective="Test Objective"
        )
        self.actor = CustomUser.objects.create_user(
            email="actor@example.com",
            password="password",
            username="actor"
        )

    def test_create_with_all_fields_populated(self):
        """Test creating audit log entry with all fields populated."""
        before_data = {"title": "Old Title"}
        after_data = {"title": "New Title"}
        context_data = {"field": "title", "reason": "User edit"}

        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
            before=before_data,
            after=after_data,
            context=context_data
        )

        # Verify all fields are set correctly
        self.assertIsNotNone(audit_log.id)
        self.assertEqual(audit_log.meeting, self.meeting)
        self.assertEqual(audit_log.actor, self.actor)
        self.assertEqual(audit_log.event_type, MeetingAuditLog.EVENT_TITLE_CHANGED)
        self.assertEqual(audit_log.before, before_data)
        self.assertEqual(audit_log.after, after_data)
        self.assertEqual(audit_log.context, context_data)
        self.assertIsNotNone(audit_log.timestamp)

    def test_create_with_null_actor_system_event(self):
        """Test creating audit log entry with null actor for system events."""
        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=None,  # System event
            event_type=MeetingAuditLog.EVENT_TEMPLATE_APPLIED,
            context={"template_id": "template-123"}
        )

        self.assertIsNone(audit_log.actor)
        self.assertEqual(audit_log.event_type, MeetingAuditLog.EVENT_TEMPLATE_APPLIED)
        self.assertEqual(audit_log.context, {"template_id": "template-123"})

    def test_create_with_null_before_after_context_fields(self):
        """Test creating audit log entry with null JSON fields."""
        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_PARTICIPANT_ADDED,
            before=None,
            after=None,
            context=None
        )

        self.assertIsNone(audit_log.before)
        self.assertIsNone(audit_log.after)
        self.assertIsNone(audit_log.context)

    def test_timestamp_auto_populated(self):
        """Test that timestamp is automatically set on creation."""
        before_create = datetime.now()

        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
        )

        after_create = datetime.now()

        # Verify timestamp is within reasonable range
        self.assertIsNotNone(audit_log.timestamp)
        self.assertGreaterEqual(audit_log.timestamp, before_create)
        self.assertLessEqual(audit_log.timestamp, after_create)

    def test_uuid_primary_key_auto_generated(self):
        """Test that UUID primary key is automatically generated."""
        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
        )

        # Verify UUID is auto-generated and valid
        self.assertIsNotNone(audit_log.id)
        self.assertEqual(len(str(audit_log.id)), 36)  # UUID string length with hyphens

    def test_create_multiple_entries_unique_ids(self):
        """Test that multiple entries get unique UUIDs."""
        audit_log_1 = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
        )

        audit_log_2 = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
        )

        self.assertNotEqual(audit_log_1.id, audit_log_2.id)

    def test_all_event_type_choices_valid(self):
        """Test that all event type choices can be created."""
        event_types = [
            MeetingAuditLog.EVENT_STATUS_CHANGED,
            MeetingAuditLog.EVENT_TITLE_CHANGED,
            MeetingAuditLog.EVENT_OBJECTIVE_CHANGED,
            MeetingAuditLog.EVENT_SUMMARY_CHANGED,
            MeetingAuditLog.EVENT_TYPE_CHANGED,
            MeetingAuditLog.EVENT_DATETIME_CHANGED,
            MeetingAuditLog.EVENT_PARTICIPANT_ADDED,
            MeetingAuditLog.EVENT_PARTICIPANT_REMOVED,
            MeetingAuditLog.EVENT_AGENDA_ITEM_ADDED,
            MeetingAuditLog.EVENT_AGENDA_ITEM_EDITED,
            MeetingAuditLog.EVENT_AGENDA_ITEM_DELETED,
            MeetingAuditLog.EVENT_DOCUMENT_EDITED,
            MeetingAuditLog.EVENT_ACTION_ITEM_ADDED,
            MeetingAuditLog.EVENT_ACTION_ITEM_EDITED,
            MeetingAuditLog.EVENT_ACTION_ITEM_RESOLVED,
            MeetingAuditLog.EVENT_DECISION_CREATED,
            MeetingAuditLog.EVENT_TASK_CREATED,
            MeetingAuditLog.EVENT_TEMPLATE_APPLIED,
            MeetingAuditLog.EVENT_TAGS_CHANGED,
        ]

        for event_type in event_types:
            audit_log = MeetingAuditLog.objects.create(
                meeting=self.meeting,
                actor=self.actor,
                event_type=event_type,
            )
            self.assertEqual(audit_log.event_type, event_type)


class TestMeetingAuditLogImmutability(TestCase):
    """Test immutability enforcement via Postgres trigger."""

    def setUp(self):
        """Set up test fixtures."""
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.project = Project.objects.create(
            name="Test Project",
            organization=self.organization
        )
        self.type_def = MeetingTypeDefinition.objects.create(
            project=self.project,
            slug="planning",
            label="Planning Meeting"
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Test Meeting",
            type_definition=self.type_def,
            objective="Test Objective"
        )
        self.actor = CustomUser.objects.create_user(
            email="actor@example.com",
            password="password",
            username="actor"
        )
        self.audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            before={"status": "draft"},
            after={"status": "planned"}
        )

    def test_update_via_orm_raises_program_error(self):
        """Test that UPDATE via ORM raises OperationalError with immutability message."""
        with transaction.atomic():
            self.audit_log.context = {"modified": True}
            with self.assertRaises(OperationalError) as context:
                self.audit_log.save()

            # Verify error message contains immutability indicator
            self.assertIn("immutable", str(context.exception).lower())

    def test_delete_via_orm_raises_program_error(self):
        """Test that DELETE via ORM raises OperationalError with immutability message."""
        audit_log_id = self.audit_log.id

        with transaction.atomic():
            with self.assertRaises(OperationalError) as context:
                self.audit_log.delete()

            # Verify error message contains immutability indicator
            self.assertIn("immutable", str(context.exception).lower())

        # Verify record still exists after failed delete
        self.assertTrue(MeetingAuditLog.objects.filter(id=audit_log_id).exists())

    def test_update_via_queryset_raises_program_error(self):
        """Test that UPDATE via queryset raises OperationalError."""
        with transaction.atomic():
            with self.assertRaises(OperationalError) as context:
                MeetingAuditLog.objects.filter(id=self.audit_log.id).update(
                    context={"modified": True}
                )

            self.assertIn("immutable", str(context.exception).lower())

    def test_update_via_raw_sql_raises_program_error(self):
        """Test that UPDATE via raw SQL raises OperationalError."""
        with transaction.atomic():
            with self.assertRaises(OperationalError) as context:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE meetings_meetingauditlog SET context = %s WHERE id = %s",
                        [json.dumps({"modified": True}), str(self.audit_log.id)]
                    )

            self.assertIn("immutable", str(context.exception).lower())

    def test_delete_via_raw_sql_raises_program_error(self):
        """Test that DELETE via raw SQL raises OperationalError."""
        audit_log_id = self.audit_log.id

        with transaction.atomic():
            with self.assertRaises(OperationalError) as context:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM meetings_meetingauditlog WHERE id = %s",
                        [str(audit_log_id)]
                    )

            self.assertIn("immutable", str(context.exception).lower())

        # Verify record still exists after failed delete
        self.assertTrue(MeetingAuditLog.objects.filter(id=audit_log_id).exists())

    def test_create_still_works(self):
        """Test that CREATE operations are not blocked by immutability trigger."""
        new_audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
        )

        self.assertIsNotNone(new_audit_log.id)
        self.assertEqual(new_audit_log.event_type, MeetingAuditLog.EVENT_TITLE_CHANGED)

    def test_multiple_immutable_entries(self):
        """Test immutability for multiple entries."""
        audit_log_2 = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
        )

        # First entry remains immutable
        with transaction.atomic():
            self.audit_log.context = {"modified": True}
            with self.assertRaises(OperationalError):
                self.audit_log.save()

        # Second entry is also immutable
        with transaction.atomic():
            audit_log_2.context = {"modified": True}
            with self.assertRaises(OperationalError):
                audit_log_2.save()


class TestMeetingAuditLogIndexes(TestCase):
    """Verify that all composite indexes exist."""

    def setUp(self):
        """Set up test fixtures."""
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.project = Project.objects.create(
            name="Test Project",
            organization=self.organization
        )
        self.type_def = MeetingTypeDefinition.objects.create(
            project=self.project,
            slug="planning",
            label="Planning Meeting"
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Test Meeting",
            type_definition=self.type_def,
            objective="Test Objective"
        )

    def test_index_meeting_timestamp_exists(self):
        """Test that (meeting_id, -timestamp) index exists."""
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'meetings_meetingauditlog'
                AND indexname = 'audit_mtg_ts_idx'
            """)
            result = cursor.fetchone()

        self.assertIsNotNone(result, "Index 'audit_mtg_ts_idx' not found")

    def test_index_meeting_event_type_timestamp_exists(self):
        """Test that (meeting_id, event_type, -timestamp) index exists."""
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'meetings_meetingauditlog'
                AND indexname = 'audit_mtg_type_ts_idx'
            """)
            result = cursor.fetchone()

        self.assertIsNotNone(result, "Index 'audit_mtg_type_ts_idx' not found")

    def test_index_meeting_actor_timestamp_exists(self):
        """Test that (meeting_id, actor_id, -timestamp) index exists."""
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'meetings_meetingauditlog'
                AND indexname = 'audit_mtg_actor_ts_idx'
            """)
            result = cursor.fetchone()

        self.assertIsNotNone(result, "Index 'audit_mtg_actor_ts_idx' not found")

    def test_all_required_indexes_exist(self):
        """Test that all three required indexes exist."""
        expected_indexes = [
            'audit_mtg_ts_idx',
            'audit_mtg_type_ts_idx',
            'audit_mtg_actor_ts_idx',
        ]

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'meetings_meetingauditlog'
            """)
            existing_indexes = [row[0] for row in cursor.fetchall()]

        for expected_index in expected_indexes:
            self.assertIn(
                expected_index,
                existing_indexes,
                f"Required index '{expected_index}' not found"
            )


class TestMeetingAuditLogSerialization(TestCase):
    """Test JSON field serialization and deserialization."""

    def setUp(self):
        """Set up test fixtures."""
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.project = Project.objects.create(
            name="Test Project",
            organization=self.organization
        )
        self.type_def = MeetingTypeDefinition.objects.create(
            project=self.project,
            slug="planning",
            label="Planning Meeting"
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Test Meeting",
            type_definition=self.type_def,
            objective="Test Objective"
        )
        self.actor = CustomUser.objects.create_user(
            email="actor@example.com",
            password="password",
            username="actor"
        )

    def test_before_field_serialization(self):
        """Test that before JSONField serializes and deserializes correctly."""
        before_data = {
            "title": "Old Title",
            "status": "draft",
            "nested": {"key": "value"}
        }

        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
            before=before_data
        )

        # Fetch from database to verify serialization/deserialization
        audit_log.refresh_from_db()
        self.assertEqual(audit_log.before, before_data)
        self.assertIsInstance(audit_log.before["nested"], dict)

    def test_after_field_serialization(self):
        """Test that after JSONField serializes and deserializes correctly."""
        after_data = {
            "title": "New Title",
            "status": "planned",
            "array": [1, 2, 3],
            "nested": {"deep": {"key": "value"}}
        }

        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
            after=after_data
        )

        audit_log.refresh_from_db()
        self.assertEqual(audit_log.after, after_data)
        self.assertEqual(audit_log.after["array"], [1, 2, 3])
        self.assertEqual(audit_log.after["nested"]["deep"]["key"], "value")

    def test_context_field_serialization(self):
        """Test that context JSONField serializes and deserializes correctly."""
        context_data = {
            "field": "title",
            "reason": "User edit",
            "metadata": {
                "ip_address": "192.168.1.1",
                "user_agent": "Mozilla/5.0"
            }
        }

        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
            context=context_data
        )

        audit_log.refresh_from_db()
        self.assertEqual(audit_log.context, context_data)
        self.assertEqual(audit_log.context["metadata"]["ip_address"], "192.168.1.1")

    def test_null_before_field_serialization(self):
        """Test that null before field is preserved correctly."""
        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_PARTICIPANT_ADDED,
            before=None,
            after={"participant_id": 123}
        )

        audit_log.refresh_from_db()
        self.assertIsNone(audit_log.before)
        self.assertIsNotNone(audit_log.after)

    def test_null_after_field_serialization(self):
        """Test that null after field is preserved correctly."""
        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_PARTICIPANT_REMOVED,
            before={"participant_id": 123},
            after=None
        )

        audit_log.refresh_from_db()
        self.assertIsNotNone(audit_log.before)
        self.assertIsNone(audit_log.after)

    def test_null_context_field_serialization(self):
        """Test that null context field is preserved correctly."""
        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            context=None
        )

        audit_log.refresh_from_db()
        self.assertIsNone(audit_log.context)

    def test_complex_nested_json_serialization(self):
        """Test complex nested JSON structures serialize correctly."""
        complex_data = {
            "level1": {
                "level2": {
                    "level3": {
                        "items": [
                            {"id": 1, "name": "item1"},
                            {"id": 2, "name": "item2"},
                        ],
                        "metadata": {
                            "count": 2,
                            "flags": [True, False, True]
                        }
                    }
                }
            }
        }

        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            before=complex_data
        )

        audit_log.refresh_from_db()
        self.assertEqual(
            audit_log.before["level1"]["level2"]["level3"]["items"][0]["name"],
            "item1"
        )
        self.assertEqual(
            audit_log.before["level1"]["level2"]["level3"]["metadata"]["count"],
            2
        )

    def test_empty_dict_context_default(self):
        """Test that context defaults to empty dict when not specified."""
        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
        )

        # Default value should be empty dict
        self.assertEqual(audit_log.context, {})

    def test_unicode_in_json_fields(self):
        """Test that unicode characters in JSON fields are preserved."""
        unicode_data = {
            "title": "Meeting with unicode: 日本語 العربية Ελληνικά",
            "emoji": "🎉 🚀 ✨",
            "rtl": "شرح من اليمين إلى اليسار"
        }

        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
            before=unicode_data
        )

        audit_log.refresh_from_db()
        self.assertEqual(audit_log.before["title"], unicode_data["title"])
        self.assertEqual(audit_log.before["emoji"], unicode_data["emoji"])


class TestMeetingAuditLogRelationships(TestCase):
    """Test foreign key relationships and constraints."""

    def setUp(self):
        """Set up test fixtures."""
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.project = Project.objects.create(
            name="Test Project",
            organization=self.organization
        )
        self.type_def = MeetingTypeDefinition.objects.create(
            project=self.project,
            slug="planning",
            label="Planning Meeting"
        )
        self.meeting = Meeting.objects.create(
            project=self.project,
            title="Test Meeting",
            type_definition=self.type_def,
            objective="Test Objective"
        )
        self.actor = CustomUser.objects.create_user(
            email="actor@example.com",
            password="password",
            username="actor"
        )

    def test_meeting_protected_on_delete(self):
        """Test that deleting a meeting is protected when audit logs exist."""
        MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
        )

        from django.db.models.deletion import ProtectedError

        with self.assertRaises(ProtectedError):
            self.meeting.delete()

    def test_actor_set_null_on_delete(self):
        """Test that actor is set to NULL when user is deleted."""
        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
        )

        self.actor.delete()

        audit_log.refresh_from_db()
        self.assertIsNone(audit_log.actor)

    def test_query_by_actor(self):
        """Test querying audit logs by actor."""
        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
        )

        result = MeetingAuditLog.objects.filter(actor=self.actor).first()
        self.assertEqual(result.id, audit_log.id)

    def test_query_by_meeting(self):
        """Test querying audit logs by meeting."""
        audit_log = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
        )

        result = MeetingAuditLog.objects.filter(meeting=self.meeting).first()
        self.assertEqual(result.id, audit_log.id)

    def test_audit_log_ordering_by_timestamp(self):
        """Test that audit logs are ordered by timestamp descending."""
        import time

        audit_log_1 = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
        )

        time.sleep(0.01)  # Small delay to ensure different timestamps

        audit_log_2 = MeetingAuditLog.objects.create(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
        )

        # Default ordering should be -timestamp (newest first)
        results = list(MeetingAuditLog.objects.all())
        self.assertEqual(results[0].id, audit_log_2.id)
        self.assertEqual(results[1].id, audit_log_1.id)
