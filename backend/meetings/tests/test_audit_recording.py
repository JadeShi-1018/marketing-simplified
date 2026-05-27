"""
Comprehensive tests for record_audit_entry() function covering:
- Valid creation with various input combinations
- Event type validation (invalid, empty, None values)
- Default behavior (None defaults, auto-generated fields)
- Transaction atomicity and error handling
- Integration with real meeting mutations
"""

import time
from django.db import transaction
from django.test import TestCase
from django.utils import timezone

from core.models import Organization, Project, CustomUser
from meetings.audit import record_audit_entry
from meetings.models import Meeting, MeetingAuditLog, MeetingTypeDefinition


class TestRecordAuditEntryValidInputs(TestCase):
    """Test valid creation with various input combinations."""

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

    def test_create_with_all_parameters_populated(self):
        """Test creation with all parameters populated."""
        before_data = {"title": "Old Title", "status": "draft"}
        after_data = {"title": "New Title", "status": "planned"}
        context_data = {"field": "title", "reason": "user_initiated"}

        audit_log = record_audit_entry(
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

    def test_create_with_only_required_parameters(self):
        """Test creation with only required parameters."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED
        )

        # Verify required fields are set
        self.assertIsNotNone(audit_log.id)
        self.assertEqual(audit_log.meeting, self.meeting)
        self.assertEqual(audit_log.actor, self.actor)
        self.assertEqual(audit_log.event_type, MeetingAuditLog.EVENT_STATUS_CHANGED)
        self.assertIsNotNone(audit_log.timestamp)

    def test_create_with_null_actor_system_event(self):
        """Test creation with null actor for system events."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=None,
            event_type=MeetingAuditLog.EVENT_TEMPLATE_APPLIED,
            context={"template_id": "template-123"}
        )

        self.assertIsNone(audit_log.actor)
        self.assertEqual(audit_log.event_type, MeetingAuditLog.EVENT_TEMPLATE_APPLIED)
        self.assertEqual(audit_log.context, {"template_id": "template-123"})

    def test_create_with_null_before_field(self):
        """Test creation with null before field."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_PARTICIPANT_ADDED,
            before=None,
            after={"participant_id": 123}
        )

        self.assertIsNone(audit_log.before)
        self.assertEqual(audit_log.after, {"participant_id": 123})

    def test_create_with_null_after_field(self):
        """Test creation with null after field."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_PARTICIPANT_REMOVED,
            before={"participant_id": 123},
            after=None
        )

        self.assertEqual(audit_log.before, {"participant_id": 123})
        self.assertIsNone(audit_log.after)

    def test_create_with_null_context_field(self):
        """Test creation with null context field."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            context=None
        )

        # context should default to empty dict when None is passed
        self.assertEqual(audit_log.context, {})

    def test_create_with_empty_dict_before(self):
        """Test creation with empty dict for before field."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            before={},
            after={"status": "planned"}
        )

        # Empty dict before should be converted to None by record_audit_entry
        self.assertIsNone(audit_log.before)
        self.assertEqual(audit_log.after, {"status": "planned"})

    def test_create_with_empty_dict_after(self):
        """Test creation with empty dict for after field."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            before={"status": "draft"},
            after={}
        )

        self.assertEqual(audit_log.before, {"status": "draft"})
        # Empty dict after should be converted to None
        self.assertIsNone(audit_log.after)

    def test_create_with_empty_dict_context(self):
        """Test creation with empty dict for context field."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            context={}
        )

        # Empty dict context stays as empty dict
        self.assertEqual(audit_log.context, {})

    def test_create_with_complex_nested_json_before(self):
        """Test creation with complex nested JSON in before field."""
        before_data = {
            "level1": {
                "level2": {
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

        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            before=before_data,
            after={"status": "completed"}
        )

        self.assertEqual(audit_log.before, before_data)
        self.assertEqual(
            audit_log.before["level1"]["level2"]["items"][0]["name"],
            "item1"
        )

    def test_create_with_complex_nested_json_after(self):
        """Test creation with complex nested JSON in after field."""
        after_data = {
            "participants": [
                {"id": "user1", "role": "organizer", "joined_at": "2024-01-01T10:00:00Z"},
                {"id": "user2", "role": "attendee", "joined_at": "2024-01-01T10:05:00Z"},
            ],
            "settings": {
                "recording": {"enabled": True, "auto_transcribe": True},
                "notifications": {"email": False, "slack": True}
            }
        }

        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            before={},
            after=after_data
        )

        self.assertIsNone(audit_log.before)
        self.assertEqual(audit_log.after, after_data)
        self.assertEqual(audit_log.after["participants"][0]["role"], "organizer")

    def test_create_with_complex_nested_json_context(self):
        """Test creation with complex nested JSON in context field."""
        context_data = {
            "source": "api",
            "request_id": "req-12345",
            "user_metadata": {
                "ip_address": "192.168.1.1",
                "user_agent": "Mozilla/5.0",
                "timezone": "UTC"
            },
            "change_summary": {
                "fields_modified": ["title", "objective"],
                "before_snapshot": {"title": "Old", "objective": "Old Obj"}
            }
        }

        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            context=context_data
        )

        self.assertEqual(audit_log.context, context_data)
        self.assertEqual(audit_log.context["user_metadata"]["timezone"], "UTC")


class TestRecordAuditEntryEventTypeValidation(TestCase):
    """Test that invalid event_type raises ValueError."""

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

    def test_invalid_event_type_string_raises_value_error(self):
        """Test that invalid event_type string raises ValueError."""
        with self.assertRaises(ValueError) as context:
            record_audit_entry(
                meeting=self.meeting,
                actor=self.actor,
                event_type="invalid.event.type"
            )

        # Verify error message contains 'event_type'
        self.assertIn("event_type", str(context.exception).lower())

    def test_empty_string_event_type_raises_value_error(self):
        """Test that empty string event_type raises ValueError."""
        with self.assertRaises(ValueError) as context:
            record_audit_entry(
                meeting=self.meeting,
                actor=self.actor,
                event_type=""
            )

        self.assertIn("event_type", str(context.exception).lower())

    def test_none_event_type_raises_value_error(self):
        """Test that None event_type raises ValueError."""
        with self.assertRaises(ValueError):
            record_audit_entry(
                meeting=self.meeting,
                actor=self.actor,
                event_type=None
            )

    def test_random_string_event_type_raises_value_error(self):
        """Test that random string event_type raises ValueError."""
        with self.assertRaises(ValueError) as context:
            record_audit_entry(
                meeting=self.meeting,
                actor=self.actor,
                event_type="meeting.something_weird"
            )

        self.assertIn("event_type", str(context.exception).lower())

    def test_all_valid_event_types_accepted(self):
        """Test that all 19 valid event types are accepted without raising."""
        valid_event_types = [
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

        self.assertEqual(len(valid_event_types), 19)

        for event_type in valid_event_types:
            audit_log = record_audit_entry(
                meeting=self.meeting,
                actor=self.actor,
                event_type=event_type
            )
            self.assertEqual(audit_log.event_type, event_type)

    def test_event_type_validation_error_includes_valid_choices(self):
        """Test that error message includes list of valid event type choices."""
        with self.assertRaises(ValueError) as context:
            record_audit_entry(
                meeting=self.meeting,
                actor=self.actor,
                event_type="meeting.invalid_event"
            )

        error_msg = str(context.exception)
        # Should mention valid choices
        self.assertIn("valid choices", error_msg.lower())


class TestRecordAuditEntryDefaults(TestCase):
    """Test function defaults when optional parameters are omitted."""

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

    def test_before_defaults_to_none_when_omitted(self):
        """Test that before defaults to None when not provided."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED
        )

        self.assertIsNone(audit_log.before)

    def test_after_defaults_to_none_when_omitted(self):
        """Test that after defaults to None when not provided."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED
        )

        self.assertIsNone(audit_log.after)

    def test_context_defaults_to_empty_dict_when_omitted(self):
        """Test that context defaults to empty dict when not provided."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED
        )

        self.assertEqual(audit_log.context, {})

    def test_function_returns_created_audit_log_instance(self):
        """Test that function returns created MeetingAuditLog instance."""
        result = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED
        )

        self.assertIsInstance(result, MeetingAuditLog)
        self.assertEqual(result.meeting, self.meeting)
        self.assertEqual(result.actor, self.actor)

    def test_timestamp_auto_populated(self):
        """Test that timestamp is auto-populated."""
        before_create = timezone.now()

        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED
        )

        after_create = timezone.now()

        # Verify timestamp is within reasonable range
        self.assertIsNotNone(audit_log.timestamp)
        self.assertGreaterEqual(audit_log.timestamp, before_create)
        self.assertLessEqual(audit_log.timestamp, after_create)

    def test_uuid_auto_generated(self):
        """Test that UUID is auto-generated."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED
        )

        # Verify UUID is auto-generated and valid
        self.assertIsNotNone(audit_log.id)
        self.assertEqual(len(str(audit_log.id)), 36)  # UUID string length with hyphens

    def test_multiple_calls_generate_unique_uuids(self):
        """Test that multiple calls generate unique UUIDs."""
        audit_log_1 = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED
        )

        audit_log_2 = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED
        )

        self.assertNotEqual(audit_log_1.id, audit_log_2.id)

    def test_multiple_calls_generate_different_timestamps(self):
        """Test that multiple calls generate different timestamps."""
        audit_log_1 = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED
        )

        time.sleep(0.01)  # Small delay to ensure different timestamps

        audit_log_2 = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED
        )

        self.assertLess(audit_log_1.timestamp, audit_log_2.timestamp)


class TestRecordAuditEntryTransactionBehavior(TestCase):
    """Test function behavior in transaction context."""

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

    def test_function_works_within_atomic_transaction(self):
        """Test that function works within transaction.atomic() blocks."""
        with transaction.atomic():
            audit_log = record_audit_entry(
                meeting=self.meeting,
                actor=self.actor,
                event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
                before={"status": "draft"},
                after={"status": "planned"}
            )

        # Verify entry was created and committed
        self.assertIsNotNone(audit_log.id)
        self.assertTrue(MeetingAuditLog.objects.filter(id=audit_log.id).exists())

    def test_multiple_calls_within_atomic_transaction(self):
        """Test multiple record_audit_entry calls within atomic block."""
        with transaction.atomic():
            audit_log_1 = record_audit_entry(
                meeting=self.meeting,
                actor=self.actor,
                event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
                before={"status": "draft"},
                after={"status": "planned"}
            )

            audit_log_2 = record_audit_entry(
                meeting=self.meeting,
                actor=self.actor,
                event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
                before={"title": "Old Title"},
                after={"title": "New Title"}
            )

        # Both entries should be created
        self.assertTrue(MeetingAuditLog.objects.filter(id=audit_log_1.id).exists())
        self.assertTrue(MeetingAuditLog.objects.filter(id=audit_log_2.id).exists())

    def test_atomic_transaction_rollback_prevents_audit_creation(self):
        """Test that if transaction fails, no partial audit data is persisted."""
        from django.db import IntegrityError

        initial_count = MeetingAuditLog.objects.count()

        try:
            with transaction.atomic():
                # Create an audit log
                record_audit_entry(
                    meeting=self.meeting,
                    actor=self.actor,
                    event_type=MeetingAuditLog.EVENT_STATUS_CHANGED
                )

                # Force a transaction failure
                with transaction.atomic():
                    raise IntegrityError("Simulated database error")
        except IntegrityError:
            pass

        # Verify the entire transaction was rolled back
        self.assertEqual(MeetingAuditLog.objects.count(), initial_count)


class TestRecordAuditEntryIntegration(TestCase):
    """Test record_audit_entry with real meeting mutations."""

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
            objective="Test Objective",
            status=Meeting.STATUS_DRAFT
        )
        self.actor = CustomUser.objects.create_user(
            email="actor@example.com",
            password="password",
            username="actor"
        )

    def test_record_after_meeting_status_update(self):
        """Test calling record_audit_entry after a simulated meeting update."""
        # Simulate a meeting status change
        old_status = self.meeting.status
        self.meeting.status = Meeting.STATUS_PLANNED
        self.meeting.save(update_fields=['status'])

        # Record the audit entry
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            before={"status": old_status},
            after={"status": self.meeting.status},
            context={"reason": "user_initiated"}
        )

        # Verify audit entry correctly captures before/after state
        self.assertEqual(audit_log.before, {"status": Meeting.STATUS_DRAFT})
        self.assertEqual(audit_log.after, {"status": Meeting.STATUS_PLANNED})
        self.assertEqual(audit_log.context, {"reason": "user_initiated"})

    def test_record_after_meeting_title_update(self):
        """Test recording after meeting title update."""
        old_title = self.meeting.title
        new_title = "Updated Meeting Title"
        self.meeting.title = new_title
        self.meeting.save(update_fields=['title'])

        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
            before={"title": old_title},
            after={"title": new_title}
        )

        self.assertEqual(audit_log.before["title"], old_title)
        self.assertEqual(audit_log.after["title"], new_title)

    def test_record_after_meeting_objective_update(self):
        """Test recording after meeting objective update."""
        old_objective = self.meeting.objective
        new_objective = "Updated Objective Text"
        self.meeting.objective = new_objective
        self.meeting.save(update_fields=['objective'])

        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_OBJECTIVE_CHANGED,
            before={"objective": old_objective},
            after={"objective": new_objective}
        )

        self.assertEqual(audit_log.before["objective"], old_objective)
        self.assertEqual(audit_log.after["objective"], new_objective)

    def test_system_event_without_actor(self):
        """Test recording a system event without actor."""
        audit_log = record_audit_entry(
            meeting=self.meeting,
            actor=None,
            event_type=MeetingAuditLog.EVENT_TEMPLATE_APPLIED,
            context={"template_id": "default-template"}
        )

        self.assertIsNone(audit_log.actor)
        self.assertEqual(audit_log.event_type, MeetingAuditLog.EVENT_TEMPLATE_APPLIED)

    def test_sequence_of_audit_entries_for_single_meeting(self):
        """Test recording a sequence of audit entries for a single meeting."""
        # First mutation: status change
        old_status = self.meeting.status
        self.meeting.status = Meeting.STATUS_PLANNED
        self.meeting.save(update_fields=['status'])

        audit_log_1 = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            before={"status": old_status},
            after={"status": Meeting.STATUS_PLANNED}
        )

        time.sleep(0.01)

        # Second mutation: title change
        old_title = self.meeting.title
        new_title = "Updated Title"
        self.meeting.title = new_title
        self.meeting.save(update_fields=['title'])

        audit_log_2 = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
            before={"title": old_title},
            after={"title": new_title}
        )

        # Verify both entries exist and are ordered correctly
        meeting_logs = MeetingAuditLog.objects.filter(
            meeting=self.meeting
        ).order_by('-timestamp')

        self.assertEqual(meeting_logs.count(), 2)
        self.assertEqual(meeting_logs[0].id, audit_log_2.id)
        self.assertEqual(meeting_logs[1].id, audit_log_1.id)

    def test_multiple_actors_record_audit_entries(self):
        """Test recording audit entries from different actors."""
        actor_2 = CustomUser.objects.create_user(
            email="actor2@example.com",
            password="password",
            username="actor2"
        )

        # First change by actor 1
        audit_log_1 = record_audit_entry(
            meeting=self.meeting,
            actor=self.actor,
            event_type=MeetingAuditLog.EVENT_STATUS_CHANGED,
            before={"status": Meeting.STATUS_DRAFT},
            after={"status": Meeting.STATUS_PLANNED}
        )

        # Second change by actor 2
        audit_log_2 = record_audit_entry(
            meeting=self.meeting,
            actor=actor_2,
            event_type=MeetingAuditLog.EVENT_TITLE_CHANGED,
            before={"title": "Old Title"},
            after={"title": "New Title"}
        )

        # Verify both entries record correct actors
        self.assertEqual(audit_log_1.actor, self.actor)
        self.assertEqual(audit_log_2.actor, actor_2)

        # Verify we can query by actor
        actor_1_logs = MeetingAuditLog.objects.filter(
            meeting=self.meeting,
            actor=self.actor
        )
        self.assertEqual(actor_1_logs.count(), 1)

        actor_2_logs = MeetingAuditLog.objects.filter(
            meeting=self.meeting,
            actor=actor_2
        )
        self.assertEqual(actor_2_logs.count(), 1)
