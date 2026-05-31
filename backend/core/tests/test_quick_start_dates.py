"""Quick Start date normalization — nothing before today."""

from __future__ import annotations

from datetime import date

import pytest
from freezegun import freeze_time

from core.services.quick_start.dates import (
    normalize_quick_start_calendar_events,
    normalize_quick_start_date,
    normalize_quick_start_datetime_range,
    normalize_quick_start_task_dates,
)
from core.services.quick_start.validation import validate_and_normalize_blueprint

SAMPLE_WITH_PAST_DATES = {
    'version': 1,
    'project': {'name': 'Past Date Campaign', 'description': 'Test'},
    'tasks': [
        {
            'summary': 'Legacy task',
            'type': 'execution',
            'priority': 'MEDIUM',
            'due_date': '2024-06-15',
            'planned_start_date': '2024-06-01',
        },
        {
            'summary': 'Task 2',
            'type': 'execution',
            'priority': 'MEDIUM',
        },
        {
            'summary': 'Task 3',
            'type': 'execution',
            'priority': 'MEDIUM',
        },
        {
            'summary': 'Task 4',
            'type': 'execution',
            'priority': 'MEDIUM',
        },
        {
            'summary': 'Task 5',
            'type': 'execution',
            'priority': 'MEDIUM',
        },
    ],
    'spreadsheets': [
        {
            'name': 'Plan',
            'sheets': [
                {
                    'name': 'Timeline',
                    'columns': [
                        {'name': 'Milestone', 'position': 0},
                        {'name': 'Date', 'position': 1},
                        {'name': 'Owner', 'position': 2},
                    ],
                    'rows': [['Kickoff', '2023-05-01', 'PM']],
                }
            ],
        }
    ],
    'calendar_events': [
        {
            'title': 'Kickoff',
            'start_datetime': '2024-06-01T10:00:00Z',
            'end_datetime': '2024-06-01T11:00:00Z',
            'timezone': 'UTC',
            'is_all_day': False,
        }
    ],
    'decisions': [
        {'title': 'Channel mix', 'description': 'Meta vs Google'},
        {'title': 'Budget split', 'description': 'Test'},
    ],
    'miro_boards': [],
}

DEFAULT_MODULES = {
    'tasks': True,
    'spreadsheet': True,
    'calendar': True,
    'decisions': True,
    'miro': False,
}


@freeze_time('2026-05-22T12:00:00Z')
class TestQuickStartDateNormalization:
    def test_normalize_past_calendar_year_to_current_or_future(self):
        start, end = normalize_quick_start_datetime_range(
            '2024-06-01T10:00:00Z',
            '2024-06-01T11:00:00Z',
        )
        assert start.startswith('2026-06-01T10:00:00')
        assert end.startswith('2026-06-01T11:00:00')

    def test_same_year_past_calendar_uses_now_not_next_year(self):
        start, end = normalize_quick_start_datetime_range(
            '2026-05-20T10:00:00Z',
            '2026-05-20T11:00:00Z',
        )
        assert start.startswith('2026-05-22')
        assert not start.startswith('2027')
        assert end.startswith('2026-05-22')

    def test_calendar_batch_sorts_and_pulls_far_future_outliers(self):
        events = normalize_quick_start_calendar_events(
            [
                {
                    'title': 'Far future audit',
                    'start_datetime': '2028-01-01T10:00:00Z',
                    'end_datetime': '2028-01-01T11:00:00Z',
                    'timezone': 'UTC',
                    'is_all_day': False,
                },
                {
                    'title': 'Soft launch',
                    'start_datetime': '2026-06-15T10:00:00Z',
                    'end_datetime': '2026-06-22T11:00:00Z',
                    'timezone': 'UTC',
                    'is_all_day': False,
                },
                {
                    'title': 'Campaign end',
                    'start_datetime': '2026-08-31T10:00:00Z',
                    'end_datetime': '2026-08-31T11:00:00Z',
                    'timezone': 'UTC',
                    'is_all_day': False,
                },
            ]
        )
        assert events[0]['start_datetime'] < events[-1]['start_datetime']
        assert events[-1]['title'] == 'Campaign end'
        audit_start = next(e for e in events if e['title'] == 'Far future audit')['start_datetime']
        assert audit_start.startswith('2026-06')
        assert not audit_start.startswith('2028')

    def test_normalize_past_task_dates(self):
        planned, due = normalize_quick_start_task_dates('2024-06-01', '2024-06-15')
        assert planned == '2026-06-01'
        assert due == '2026-06-15'

    def test_normalize_past_date_string_bumps_to_today_when_same_year_but_past(self):
        assert normalize_quick_start_date('2026-05-01') == '2026-05-22'

    def test_validate_blueprint_clamps_all_module_dates(self):
        blueprint = validate_and_normalize_blueprint(
            SAMPLE_WITH_PAST_DATES, DEFAULT_MODULES
        )

        assert blueprint['tasks'][0]['planned_start_date'] == '2026-06-01'
        assert blueprint['tasks'][0]['due_date'] == '2026-06-15'
        assert blueprint['calendar_events'][0]['start_datetime'].startswith('2026-06-01')
        row_date = blueprint['spreadsheets'][0]['sheets'][0]['rows'][0][1]
        assert row_date == '2026-05-22'
