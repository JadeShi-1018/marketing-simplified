"""qs-2.1e: Quick Start decision seeder tests."""

import pytest

from core.services.quick_start.seeder import QuickStartProjectSeeder
from core.services.quick_start.validation import validate_and_normalize_blueprint
from core.tests.test_quick_start_llm import DEFAULT_MODULES, SAMPLE_LLM_PAYLOAD
from decision.models import Decision


@pytest.mark.django_db
class TestQuickStartDecisionSeeder:
    def test_seed_decisions_creates_draft_rows(self, user):
        payload = {
            **SAMPLE_LLM_PAYLOAD,
            'decisions': [
                {
                    'title': 'Approve Q2 channel mix',
                    'description': 'Meta vs Google split',
                },
                {
                    'title': 'Set prospecting vs retargeting budget split',
                    'description': '60/40 for launch phase',
                },
            ],
        }
        modules = {**DEFAULT_MODULES, 'decisions': True}
        blueprint = validate_and_normalize_blueprint(payload, modules)

        result = QuickStartProjectSeeder.seed_blueprint(
            user=user,
            blueprint=blueprint,
            selected_modules=modules,
        )

        assert len(result.decision_ids) == 2
        decision = Decision.objects.get(id=result.decision_ids[0])
        assert decision.title == 'Approve Q2 channel mix'
        assert decision.context_summary == 'Meta vs Google split'
        assert decision.status == Decision.Status.DRAFT
        assert decision.project_id == result.project.id
        assert decision.author_id == user.id

    def test_decisions_disabled_skips_seed(self, user):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
        result = QuickStartProjectSeeder.seed_blueprint(
            user=user,
            blueprint=blueprint,
            selected_modules=DEFAULT_MODULES,
        )
        assert result.decision_ids == ()
