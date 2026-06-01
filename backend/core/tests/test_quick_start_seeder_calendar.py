"""qs-2.1d: Quick Start calendar events + module toggle seeder tests."""

import pytest

from calendars.models import Event
from core.services.quick_start.seeder import QuickStartProjectSeeder
from core.services.quick_start.validation import validate_and_normalize_blueprint
from core.tests.test_quick_start_llm import DEFAULT_MODULES, SAMPLE_LLM_PAYLOAD
from spreadsheet.models import Spreadsheet
from task.models import Task


@pytest.mark.django_db
class TestQuickStartCalendarSeeder:
    def test_seed_calendar_events(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
        base = QuickStartProjectSeeder.seed_project(user=user, blueprint=blueprint)

        event_ids = QuickStartProjectSeeder.seed_calendar_events(
            project=base.project,
            user=user,
            calendar_id=base.calendar_id,
            events=blueprint['calendar_events'],
        )

        assert len(event_ids) >= 1
        event = Event.objects.get(id=event_ids[0])
        assert event.title == 'Kickoff'
        assert str(event.calendar_id) == base.calendar_id

    def test_seed_blueprint_full_mvp(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)

        result = QuickStartProjectSeeder.seed_blueprint(
            user=user,
            blueprint=blueprint,
            selected_modules=DEFAULT_MODULES,
        )

        assert len(result.task_ids) >= 5
        assert len(result.spreadsheet_ids) == 1
        assert len(result.calendar_event_ids) >= 1
        assert Task.objects.filter(project=result.project).count() >= 5
        assert Spreadsheet.objects.filter(project=result.project).count() == 1
        assert Event.objects.filter(calendar_id=result.calendar_id).count() >= 1


@pytest.mark.django_db
class TestQuickStartModuleToggles:
    def test_disable_tasks_skips_task_creation(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
        modules = {**DEFAULT_MODULES, 'tasks': False}

        result = QuickStartProjectSeeder.seed_blueprint(
            user=user,
            blueprint=blueprint,
            selected_modules=modules,
        )

        assert result.task_ids == ()
        assert Task.objects.filter(project=result.project).count() == 0
        assert len(result.spreadsheet_ids) == 1
        assert len(result.calendar_event_ids) >= 1

    def test_disable_spreadsheet_skips_spreadsheet_creation(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
        modules = {**DEFAULT_MODULES, 'spreadsheet': False}

        result = QuickStartProjectSeeder.seed_blueprint(
            user=user,
            blueprint=blueprint,
            selected_modules=modules,
        )

        assert len(result.task_ids) >= 5
        assert result.spreadsheet_ids == ()
        assert Spreadsheet.objects.filter(project=result.project).count() == 0

    def test_disable_calendar_skips_events(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
        modules = {**DEFAULT_MODULES, 'calendar': False}

        result = QuickStartProjectSeeder.seed_blueprint(
            user=user,
            blueprint=blueprint,
            selected_modules=modules,
        )

        assert result.calendar_event_ids == ()
        assert Event.objects.filter(calendar_id=result.calendar_id).count() == 0
        assert len(result.task_ids) >= 5
