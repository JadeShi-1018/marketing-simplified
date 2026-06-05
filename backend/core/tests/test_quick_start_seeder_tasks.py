"""qs-2.1b: Quick Start task seeder tests."""

from datetime import date

import pytest

from core.services.quick_start.seeder import QuickStartProjectSeeder
from core.services.quick_start.validation import validate_and_normalize_blueprint
from core.tests.test_quick_start_llm import DEFAULT_MODULES, SAMPLE_LLM_PAYLOAD
from task.models import Task


@pytest.mark.django_db
class TestQuickStartTaskSeeder:
    def test_seed_project_and_tasks_creates_at_least_five_tasks(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)

        result = QuickStartProjectSeeder.seed_project_and_tasks(
            user=user,
            blueprint=blueprint,
            selected_modules=DEFAULT_MODULES,
        )

        assert len(result.task_ids) >= 5
        assert Task.objects.filter(project=result.project).count() == len(result.task_ids)
        first = Task.objects.get(id=result.task_ids[0])
        assert first.summary == 'Task 1'
        assert first.status == Task.Status.DRAFT
        assert first.created_by_id == user.id
        assert first.owner_id == user.id

    def test_seed_tasks_only_after_project_exists(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
        base = QuickStartProjectSeeder.seed_project(user=user, blueprint=blueprint)

        assert base.task_ids == ()
        task_ids = QuickStartProjectSeeder.seed_tasks(
            project=base.project,
            user=user,
            tasks=blueprint['tasks'],
        )

        assert len(task_ids) == 5
        assert Task.objects.filter(project=base.project).count() == 5

    def test_seed_tasks_persists_date_fields_as_dates(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
        base = QuickStartProjectSeeder.seed_project(user=user, blueprint=blueprint)
        tasks = [
            {
                **blueprint['tasks'][0],
                'due_date': '2026-04-15',
                'planned_start_date': '2026-04-01',
            }
        ]

        QuickStartProjectSeeder.seed_tasks(project=base.project, user=user, tasks=tasks)

        task = Task.objects.get(project=base.project, summary=blueprint['tasks'][0]['summary'])
        assert isinstance(task.due_date, date)
        assert task.due_date == date(2026, 4, 15)
        assert task.planned_start_date == date(2026, 4, 1)
