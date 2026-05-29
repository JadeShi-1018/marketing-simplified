"""Light validation for stage-1 CampaignPlan JSON."""

from __future__ import annotations

from typing import Any, Mapping

from core.services.quick_start.constants import (
    MIN_CALENDAR_EVENTS_WHEN_ENABLED,
    MIN_DECISIONS_WHEN_ENABLED,
    MIN_MIRO_STICKY_NOTES_PER_BOARD,
    MIN_TASKS_WHEN_ENABLED,
    MODULE_CALENDAR,
    MODULE_DECISIONS,
    MODULE_MIRO,
    MODULE_SPREADSHEET,
    MODULE_TASKS,
)
from core.services.quick_start.exceptions import QuickStartValidationError
from core.services.quick_start.validation import _require_dict, _require_list


def validate_campaign_plan(
    raw: Mapping[str, Any],
    selected_modules: dict[str, bool],
) -> dict[str, Any]:
    if raw.get('version') != 1:
        raise QuickStartValidationError('plan.version must be 1.')

    summary = raw.get('campaign_summary')
    if not isinstance(summary, str) or not summary.strip():
        raise QuickStartValidationError('plan.campaign_summary is required.')

    project = _require_dict(raw.get('project'), 'plan.project')
    name = project.get('name')
    if not isinstance(name, str) or not name.strip():
        raise QuickStartValidationError('plan.project.name is required.')

    plan: dict[str, Any] = {
        'version': 1,
        'campaign_summary': summary.strip(),
        'project': {
            'name': name.strip()[:200],
            'description': str(project.get('description') or summary).strip()[:2000],
            'objectives': project.get('objectives') if isinstance(project.get('objectives'), list) else [],
            'project_type': project.get('project_type') if isinstance(project.get('project_type'), list) else [],
            'advertising_platforms': (
                project.get('advertising_platforms')
                if isinstance(project.get('advertising_platforms'), list)
                else []
            ),
        },
    }

    if selected_modules.get(MODULE_TASKS):
        tasks = _require_list(raw.get('tasks_plan'), 'plan.tasks_plan')
        if len(tasks) < MIN_TASKS_WHEN_ENABLED:
            raise QuickStartValidationError(
                f'plan.tasks_plan needs at least {MIN_TASKS_WHEN_ENABLED} items when tasks enabled.'
            )
        plan['tasks_plan'] = tasks

    if selected_modules.get(MODULE_SPREADSHEET):
        sheet = _require_dict(raw.get('spreadsheet_plan'), 'plan.spreadsheet_plan')
        columns = sheet.get('columns') or []
        if not isinstance(columns, list) or len(columns) < 3:
            raise QuickStartValidationError('plan.spreadsheet_plan.columns needs at least 3 items.')
        plan['spreadsheet_plan'] = sheet

    if selected_modules.get(MODULE_CALENDAR):
        events = _require_list(raw.get('calendar_plan'), 'plan.calendar_plan')
        if len(events) < MIN_CALENDAR_EVENTS_WHEN_ENABLED:
            raise QuickStartValidationError(
                'plan.calendar_plan needs at least one event when calendar enabled.'
            )
        plan['calendar_plan'] = events

    if selected_modules.get(MODULE_DECISIONS):
        decisions = _require_list(raw.get('decisions_plan'), 'plan.decisions_plan')
        if len(decisions) < MIN_DECISIONS_WHEN_ENABLED:
            raise QuickStartValidationError(
                f'plan.decisions_plan needs at least {MIN_DECISIONS_WHEN_ENABLED} items.'
            )
        plan['decisions_plan'] = decisions

    if selected_modules.get(MODULE_MIRO):
        miro = _require_dict(raw.get('miro_plan'), 'plan.miro_plan')
        themes = miro.get('sticky_themes') or []
        if not isinstance(themes, list) or len(themes) < MIN_MIRO_STICKY_NOTES_PER_BOARD:
            raise QuickStartValidationError(
                f'plan.miro_plan.sticky_themes needs at least {MIN_MIRO_STICKY_NOTES_PER_BOARD}.'
            )
        plan['miro_plan'] = miro

    return plan
