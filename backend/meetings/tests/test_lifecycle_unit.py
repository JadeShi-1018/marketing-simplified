"""
Direct unit tests for meetings/lifecycle.py state machine.

Tests every valid and invalid transition, plus all validation rules.
Uses minimal fixtures (no mocking) to ensure actual production code paths run.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError

from core.models import Organization, Project, CustomUser
from meetings.lifecycle import (
    TRANSITIONS,
    TERMINAL_STATES,
    execute_transition,
    get_available_transitions,
)
from meetings.models import Meeting, AgendaItem, ParticipantLink, MeetingActionItem
from meetings.services import ensure_meeting_type_definition, add_participant, create_agenda_item

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def organization(db):
    import uuid
    return Organization.objects.create(
        name=f"Lifecycle Test Org {uuid.uuid4().hex[:6]}",
        slug=f"lifecycle-{uuid.uuid4().hex[:6]}",
    )


@pytest.fixture
def project(organization, db):
    return Project.objects.create(name="Lifecycle Project", organization=organization)


@pytest.fixture
def member(organization, db):
    import uuid
    return CustomUser.objects.create_user(
        email=f"lc_{uuid.uuid4().hex[:6]}@lc.test",
        password="pw",
        username=f"lcmember_{uuid.uuid4().hex[:6]}",
    )


def _create_meeting(project, **kwargs):
    type_def = ensure_meeting_type_definition(project, "planning")
    defaults = dict(
        title="Test Meeting",
        type_definition=type_def,
        objective="Some objective",
        status=Meeting.STATUS_DRAFT,
    )
    defaults.update(kwargs)
    return Meeting.objects.create(project=project, **defaults)


# ---------------------------------------------------------------------------
# get_available_transitions
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGetAvailableTransitions:
    def test_draft_can_go_to_planned(self, project):
        meeting = _create_meeting(project)
        assert Meeting.STATUS_PLANNED in get_available_transitions(meeting)

    def test_planned_can_go_to_in_progress_or_draft(self, project):
        meeting = _create_meeting(project, status=Meeting.STATUS_PLANNED)
        available = get_available_transitions(meeting)
        assert Meeting.STATUS_IN_PROGRESS in available
        assert Meeting.STATUS_DRAFT in available

    def test_in_progress_can_go_to_completed_or_planned(self, project):
        meeting = _create_meeting(project, status=Meeting.STATUS_IN_PROGRESS)
        available = get_available_transitions(meeting)
        assert Meeting.STATUS_COMPLETED in available
        assert Meeting.STATUS_PLANNED in available

    def test_completed_can_go_to_archived(self, project):
        meeting = _create_meeting(project, status=Meeting.STATUS_COMPLETED)
        available = get_available_transitions(meeting)
        assert Meeting.STATUS_ARCHIVED in available
        assert len(available) == 1

    def test_archived_has_no_available_transitions(self, project):
        meeting = _create_meeting(
            project, status=Meeting.STATUS_ARCHIVED, is_archived=True
        )
        assert get_available_transitions(meeting) == []

    def test_terminal_states_constant_contains_archived(self):
        assert Meeting.STATUS_ARCHIVED in TERMINAL_STATES

    def test_transitions_constant_keys_cover_all_states(self):
        expected_states = {s[0] for s in Meeting.STATUS_CHOICES}
        assert set(TRANSITIONS.keys()) == expected_states


# ---------------------------------------------------------------------------
# execute_transition – valid transitions
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestExecuteTransitionValid:
    def test_draft_to_planned(self, project):
        meeting = _create_meeting(project, status=Meeting.STATUS_DRAFT)
        result = execute_transition(meeting, Meeting.STATUS_PLANNED)
        assert result.status == Meeting.STATUS_PLANNED
        meeting.refresh_from_db()
        assert meeting.status == Meeting.STATUS_PLANNED

    def test_planned_to_draft(self, project):
        meeting = _create_meeting(project, status=Meeting.STATUS_PLANNED)
        result = execute_transition(meeting, Meeting.STATUS_DRAFT)
        assert result.status == Meeting.STATUS_DRAFT

    def test_planned_to_in_progress_with_participant(self, project, member):
        meeting = _create_meeting(project, status=Meeting.STATUS_PLANNED)
        add_participant(meeting, member, "attendee", member)
        result = execute_transition(meeting, Meeting.STATUS_IN_PROGRESS)
        assert result.status == Meeting.STATUS_IN_PROGRESS

    def test_in_progress_to_completed_with_objective_and_agenda(self, project, member):
        meeting = _create_meeting(
            project, status=Meeting.STATUS_IN_PROGRESS, objective="Clear objective"
        )
        create_agenda_item(meeting, "Agenda item 1", 0, False, member)
        result = execute_transition(meeting, Meeting.STATUS_COMPLETED)
        assert result.status == Meeting.STATUS_COMPLETED

    def test_completed_to_archived_no_action_items(self, project):
        meeting = _create_meeting(project, status=Meeting.STATUS_COMPLETED)
        result = execute_transition(meeting, Meeting.STATUS_ARCHIVED)
        assert result.status == Meeting.STATUS_ARCHIVED
        assert result.is_archived is True

    def test_archived_sets_is_archived_true(self, project):
        meeting = _create_meeting(project, status=Meeting.STATUS_COMPLETED)
        result = execute_transition(meeting, Meeting.STATUS_ARCHIVED)
        meeting.refresh_from_db()
        assert meeting.is_archived is True

    def test_in_progress_back_to_planned(self, project, member):
        meeting = _create_meeting(project, status=Meeting.STATUS_IN_PROGRESS)
        result = execute_transition(meeting, Meeting.STATUS_PLANNED)
        assert result.status == Meeting.STATUS_PLANNED


# ---------------------------------------------------------------------------
# execute_transition – invalid transitions (errors)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestExecuteTransitionInvalid:
    def test_invalid_state_name_raises(self, project):
        meeting = _create_meeting(project)
        with pytest.raises(ValidationError) as exc_info:
            execute_transition(meeting, "not_a_real_state")
        assert "not a valid meeting state" in str(exc_info.value).lower()

    def test_terminal_state_raises_on_any_transition(self, project):
        meeting = _create_meeting(
            project, status=Meeting.STATUS_ARCHIVED, is_archived=True
        )
        with pytest.raises(ValidationError) as exc_info:
            execute_transition(meeting, Meeting.STATUS_PLANNED)
        assert "terminal state" in str(exc_info.value).lower()

    def test_draft_cannot_jump_to_in_progress(self, project):
        meeting = _create_meeting(project, status=Meeting.STATUS_DRAFT)
        with pytest.raises(ValidationError) as exc_info:
            execute_transition(meeting, Meeting.STATUS_IN_PROGRESS)
        assert "Cannot transition" in str(exc_info.value) or "Allowed" in str(exc_info.value)

    def test_draft_cannot_jump_to_completed(self, project):
        meeting = _create_meeting(project, status=Meeting.STATUS_DRAFT)
        with pytest.raises(ValidationError):
            execute_transition(meeting, Meeting.STATUS_COMPLETED)

    def test_draft_cannot_jump_to_archived(self, project):
        meeting = _create_meeting(project, status=Meeting.STATUS_DRAFT)
        with pytest.raises(ValidationError):
            execute_transition(meeting, Meeting.STATUS_ARCHIVED)

    def test_completed_cannot_go_to_in_progress(self, project):
        meeting = _create_meeting(project, status=Meeting.STATUS_COMPLETED)
        with pytest.raises(ValidationError):
            execute_transition(meeting, Meeting.STATUS_IN_PROGRESS)


# ---------------------------------------------------------------------------
# Validation rules for specific transitions
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestTransitionValidationRules:
    def test_planned_to_in_progress_without_participant_raises(self, project):
        meeting = _create_meeting(project, status=Meeting.STATUS_PLANNED)
        # No participants added
        with pytest.raises(ValidationError) as exc_info:
            execute_transition(meeting, Meeting.STATUS_IN_PROGRESS)
        assert "participant" in str(exc_info.value).lower()

    def test_in_progress_to_completed_without_objective_raises(self, project, member):
        meeting = _create_meeting(
            project, status=Meeting.STATUS_IN_PROGRESS, objective=""
        )
        create_agenda_item(meeting, "Agenda item", 0, False, member)
        with pytest.raises(ValidationError) as exc_info:
            execute_transition(meeting, Meeting.STATUS_COMPLETED)
        assert "objective" in str(exc_info.value).lower()

    def test_in_progress_to_completed_without_agenda_items_raises(self, project):
        meeting = _create_meeting(
            project, status=Meeting.STATUS_IN_PROGRESS, objective="Valid objective"
        )
        # No agenda items
        with pytest.raises(ValidationError) as exc_info:
            execute_transition(meeting, Meeting.STATUS_COMPLETED)
        assert "agenda" in str(exc_info.value).lower()

    def test_completed_to_archived_with_unresolved_action_items_raises(self, project, member):
        meeting = _create_meeting(project, status=Meeting.STATUS_COMPLETED)
        MeetingActionItem.objects.create(
            meeting=meeting,
            title="Unresolved action item",
            is_resolved=False,
        )
        with pytest.raises(ValidationError) as exc_info:
            execute_transition(meeting, Meeting.STATUS_ARCHIVED)
        assert "unresolved" in str(exc_info.value).lower()

    def test_completed_to_archived_with_all_resolved_action_items_succeeds(
        self, project, member
    ):
        meeting = _create_meeting(project, status=Meeting.STATUS_COMPLETED)
        MeetingActionItem.objects.create(
            meeting=meeting,
            title="Resolved action item",
            is_resolved=True,
        )
        result = execute_transition(meeting, Meeting.STATUS_ARCHIVED)
        assert result.status == Meeting.STATUS_ARCHIVED

    def test_in_progress_to_completed_with_whitespace_only_objective_raises(
        self, project, member
    ):
        meeting = _create_meeting(
            project, status=Meeting.STATUS_IN_PROGRESS, objective="   "
        )
        create_agenda_item(meeting, "Agenda item", 0, False, member)
        with pytest.raises(ValidationError) as exc_info:
            execute_transition(meeting, Meeting.STATUS_COMPLETED)
        assert "objective" in str(exc_info.value).lower()
