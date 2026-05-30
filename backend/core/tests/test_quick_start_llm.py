"""Quick Start LLM, validation, and preview tests (qs-1.2)."""

from __future__ import annotations

import pytest

from core.services.quick_start.exceptions import (
    QuickStartLLMError,
    QuickStartValidationError,
)
from core.services.quick_start.llm import QuickStartLLMChain
from core.services.quick_start.preview import QuickStartPreviewService
from core.services.quick_start.validation import validate_and_normalize_blueprint

SAMPLE_LLM_PAYLOAD = {
    'version': 1,
    'project': {
        'name': 'Q1 Meta Launch',
        'description': 'US performance campaign',
        'objectives': ['awareness'],
        'project_type': ['paid_social'],
        'advertising_platforms': ['meta'],
    },
    'tasks': [
        {
            'summary': f'Task {index}',
            'type': 'execution',
            'priority': 'MEDIUM',
        }
        for index in range(1, 6)
    ],
    'spreadsheets': [
        {
            'name': 'Campaign Budget',
            'sheets': [
                {
                    'name': 'Budget',
                    'columns': [
                        {'name': 'Channel', 'position': 0},
                        {'name': 'Budget', 'position': 1},
                        {'name': 'Notes', 'position': 2},
                    ],
                    'rows': [
                        ['Meta', '30000', 'Prospecting'],
                        ['Google', '20000', 'Search'],
                    ],
                }
            ],
        }
    ],
    'calendar_events': [
        {
            'title': 'Kickoff',
            'start_datetime': '2026-04-01T10:00:00Z',
            'end_datetime': '2026-04-01T11:00:00Z',
            'timezone': 'UTC',
            'is_all_day': False,
        }
    ],
    'decisions': [],
    'miro_boards': [],
}

DEFAULT_MODULES = {
    'tasks': True,
    'spreadsheet': True,
    'calendar': True,
    'decisions': False,
    'miro': False,
}


class TestBlueprintValidation:
    def test_validate_sample_payload(self):
        blueprint = validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, DEFAULT_MODULES)
        assert blueprint['project']['name'] == 'Q1 Meta Launch'
        assert len(blueprint['tasks']) == 5
        assert len(blueprint['spreadsheets']) == 1
        assert len(blueprint['calendar_events']) == 1

    def test_decisions_enabled_requires_at_least_two(self):
        modules = {**DEFAULT_MODULES, 'decisions': True}
        with pytest.raises(QuickStartValidationError):
            validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, modules)

        one_decision = {
            **SAMPLE_LLM_PAYLOAD,
            'decisions': [{'title': 'Only one'}],
        }
        with pytest.raises(QuickStartValidationError):
            validate_and_normalize_blueprint(one_decision, modules)

    def test_miro_enabled_requires_sticky_notes(self):
        modules = {**DEFAULT_MODULES, 'miro': True}
        with pytest.raises(QuickStartValidationError):
            validate_and_normalize_blueprint(SAMPLE_LLM_PAYLOAD, modules)

        board_without_notes = {
            **SAMPLE_LLM_PAYLOAD,
            'miro_boards': [{'name': 'Empty board', 'sticky_notes': []}],
        }
        with pytest.raises(QuickStartValidationError):
            validate_and_normalize_blueprint(board_without_notes, modules)

    def test_rejects_short_prompt(self):
        with pytest.raises(QuickStartValidationError):
            from core.services.quick_start.validation import validate_prompt_text

            validate_prompt_text('short')

    def test_rejects_insufficient_tasks(self):
        payload = {**SAMPLE_LLM_PAYLOAD, 'tasks': SAMPLE_LLM_PAYLOAD['tasks'][:2]}
        with pytest.raises(QuickStartValidationError):
            validate_and_normalize_blueprint(payload, DEFAULT_MODULES)

    def test_accepts_string_project_objectives_from_llm(self):
        project = {**SAMPLE_LLM_PAYLOAD['project'], 'objectives': 'awareness'}
        payload = {**SAMPLE_LLM_PAYLOAD, 'project': project}
        blueprint = validate_and_normalize_blueprint(payload, DEFAULT_MODULES)
        assert blueprint['project']['objectives'] == ['awareness']

    def test_normalizes_unknown_task_type_from_llm(self):
        payload = {
            **SAMPLE_LLM_PAYLOAD,
            'tasks': [
                {**SAMPLE_LLM_PAYLOAD['tasks'][0], 'type': 'planning'},
                *SAMPLE_LLM_PAYLOAD['tasks'][1:],
            ],
        }
        blueprint = validate_and_normalize_blueprint(payload, DEFAULT_MODULES)
        assert blueprint['tasks'][0]['type'] == 'execution'


class TestQuickStartLLMChain:
    def test_generate_blueprint_uses_two_stage_chain(self):
        from core.tests.test_quick_start_plan import SAMPLE_CAMPAIGN_PLAN

        stage = {'n': 0}

        def _mock(**kwargs):
            stage['n'] += 1
            return SAMPLE_CAMPAIGN_PLAN if stage['n'] == 1 else SAMPLE_LLM_PAYLOAD

        chain = QuickStartLLMChain(call_json=_mock)
        blueprint = chain.generate_blueprint(
            prompt='US Meta Q2 campaign with $30k budget for six weeks',
            supplement='Include prospecting and retargeting',
            selected_modules=DEFAULT_MODULES,
        )
        assert stage['n'] == 2
        assert blueprint['project']['name'] == 'Q1 Meta Launch'
        assert len(blueprint['tasks']) == 5


class TestQuickStartPreviewService:
    def test_step_one_skips_llm(self):
        service = QuickStartPreviewService()
        result = service.generate_preview(
            step=1,
            prompt='US Meta Q2 campaign with $30k budget for six weeks',
        )
        assert result['step'] == 1
        assert result['blueprint'] is None
        assert result['outline'] is None

    def test_step_two_returns_outline_and_blueprint(self):
        from core.tests.test_quick_start_plan import SAMPLE_CAMPAIGN_PLAN

        stage = {'n': 0}

        def _mock(**kwargs):
            stage['n'] += 1
            return SAMPLE_CAMPAIGN_PLAN if stage['n'] == 1 else SAMPLE_LLM_PAYLOAD

        service = QuickStartPreviewService(llm_chain=QuickStartLLMChain(call_json=_mock))
        result = service.generate_preview(
            step=2,
            prompt='US Meta Q2 campaign with $30k budget for six weeks',
            selected_modules=DEFAULT_MODULES,
        )
        assert result['step'] == 2
        assert result['blueprint']['project']['name'] == 'Q1 Meta Launch'
        assert result['outline']['modules']['tasks']['count'] == 5
        assert result['outline']['project']['title'] == 'Q1 Meta Launch'
        assert len(result['outline']['tasks']) == 5
