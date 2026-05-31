"""qs-2.1a: Quick Start project + calendar shell seeder tests."""

import pytest

from calendars.models import Calendar
from core.models import ProjectMember
from core.services.quick_start.seeder import QuickStartProjectSeeder
from core.services.quick_start.validation import validate_and_normalize_blueprint
from core.tests.test_quick_start_llm import DEFAULT_MODULES, SAMPLE_LLM_PAYLOAD
from task.models import Task


@pytest.mark.django_db
class TestQuickStartProjectSeeder:
    def test_seed_project_creates_membership_and_calendar(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)

        result = QuickStartProjectSeeder.seed_project(user=user, blueprint=blueprint)

        assert result.project.id is not None
        assert result.project.name == 'Q1 Meta Launch'
        assert result.project.organization_id == user.organization_id
        assert result.project.owner_id == user.id

        membership = ProjectMember.objects.get(user=user, project=result.project)
        assert membership.role == 'owner'
        assert membership.is_active is True

        calendar = Calendar.objects.get(id=result.calendar_id, is_deleted=False)
        assert calendar.project_id == result.project.id
        assert calendar.organization_id == user.organization_id

        user.refresh_from_db()
        assert user.active_project_id == result.project.id

    def test_seed_project_does_not_create_tasks(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)

        result = QuickStartProjectSeeder.seed_project(user=user, blueprint=blueprint)

        assert Task.objects.filter(project=result.project).count() == 0

    def test_project_title_override(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)

        result = QuickStartProjectSeeder.seed_project(
            user=user,
            blueprint=blueprint,
            project_title='Custom Title From Preview',
        )

        assert result.project.name == 'Custom Title From Preview'
