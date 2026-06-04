"""Unit tests for generation_registry."""
from django.test import TestCase

from .generation_registry import (
    GenerationValidationError,
    build_analysis_prompt,
    filter_sse_analysis_payload,
    normalize_generation_outputs,
    should_skip_workflow_step,
    validate_analysis_response,
    validate_calendar_events_response,
)


class GenerationRegistryTests(TestCase):
    def test_normalize_defaults_when_omitted(self):
        self.assertEqual(
            normalize_generation_outputs(None),
            ['recommended_tasks', 'miro_board', 'calendar_events'],
        )

    def test_normalize_parses_json_string(self):
        self.assertEqual(
            normalize_generation_outputs('["recommended_tasks"]'),
            ['recommended_tasks'],
        )

    def test_normalize_rejects_unknown_key(self):
        with self.assertRaises(GenerationValidationError):
            normalize_generation_outputs(['anomalies'])

    def test_normalize_rejects_empty_list(self):
        with self.assertRaises(GenerationValidationError):
            normalize_generation_outputs([])

    def test_build_analysis_prompt_includes_tasks_only(self):
        prompt = build_analysis_prompt(frozenset({'recommended_tasks'}), 'criteria here')
        self.assertIn('recommended_tasks', prompt)
        self.assertNotIn('anomalies', prompt)

    def test_build_analysis_prompt_empty_object_when_no_analysis_keys(self):
        prompt = build_analysis_prompt(frozenset({'miro_board'}), 'criteria here')
        self.assertIn('{}', prompt)

    def test_validate_analysis_response_exact_keys(self):
        data = {
            'recommended_tasks': [
                {
                    'type': 'optimization',
                    'summary': 'Fix ROAS',
                    'priority': 'HIGH',
                },
            ],
        }
        result = validate_analysis_response(data, frozenset({'recommended_tasks'}))
        self.assertEqual(len(result['recommended_tasks']), 1)

    def test_validate_analysis_rejects_extra_key(self):
        data = {'recommended_tasks': [], 'anomalies': []}
        with self.assertRaises(GenerationValidationError):
            validate_analysis_response(data, frozenset({'recommended_tasks'}))

    def test_validate_analysis_rejects_missing_key(self):
        with self.assertRaises(GenerationValidationError):
            validate_analysis_response({}, frozenset({'recommended_tasks'}))

    def test_validate_calendar_events_response(self):
        data = {
            'calendar_events': [
                {
                    'title': 'Review',
                    'start_datetime': '2026-06-02T10:00:00',
                    'end_datetime': '2026-06-02T11:00:00',
                    'location': '',
                    'description': '',
                },
            ],
        }
        result = validate_calendar_events_response(data)
        self.assertEqual(len(result['calendar_events']), 1)

    def test_validate_calendar_rejects_extra_top_level_key(self):
        data = {'calendar_events': [], 'answer': 'hi'}
        with self.assertRaises(GenerationValidationError):
            validate_calendar_events_response(data)

    def test_filter_sse_analysis_payload(self):
        analysis = {'recommended_tasks': [{'type': 'alert', 'summary': 'x', 'priority': 'LOW'}]}
        filtered = filter_sse_analysis_payload(
            analysis,
            frozenset({'recommended_tasks', 'miro_board'}),
        )
        self.assertEqual(list(filtered.keys()), ['recommended_tasks'])

    def test_should_skip_workflow_step(self):
        self.assertTrue(
            should_skip_workflow_step('create_tasks', frozenset({'miro_board'}))
        )
        self.assertTrue(
            should_skip_workflow_step('generate_miro_snapshot', frozenset({'recommended_tasks'}))
        )
        self.assertFalse(
            should_skip_workflow_step('analyze_data', frozenset({'recommended_tasks'}))
        )
