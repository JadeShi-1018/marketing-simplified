"""Registry for upload-analyze generation outputs (prompts, validation, catalog)."""
from __future__ import annotations

from typing import Any

GENERATION_OUTPUT_KEYS = frozenset({
    'recommended_tasks',
    'miro_board',
    'calendar_events',
})

# Keys produced by the spreadsheet analysis Gemini call (not Miro/calendar dedicated calls).
ANALYSIS_JSON_KEYS = frozenset({'recommended_tasks'})

DEFAULT_GENERATION_OUTPUTS = list(GENERATION_OUTPUT_KEYS)

CATALOG = [
    {
        'key': 'recommended_tasks',
        'label': 'Tasks',
        'description': 'Recommended tasks from spreadsheet analysis.',
    },
    {
        'key': 'miro_board',
        'label': 'Miro board',
        'description': 'Generate a Miro board snapshot from analysis context.',
    },
    {
        'key': 'calendar_events',
        'label': 'Calendar event',
        'description': 'Suggested calendar events based on analysis.',
    },
]

_TASK_TYPES = frozenset({
    'optimization', 'alert', 'asset', 'execution', 'budget', 'report',
    'scaling', 'communication', 'retrospective', 'experiment', 'platform_policy_update',
})
_TASK_PRIORITIES = frozenset({'HIGH', 'MEDIUM', 'LOW'})

_RECOMMENDED_TASKS_SCHEMA = """\
  "recommended_tasks": [
    {
      "type": "one of: optimization, alert, asset, execution, budget, report, scaling, communication, retrospective, experiment, platform_policy_update",
      "summary": "Short task title (max 255 chars)",
      "description": "2-4 sentence actionable description: why this task was created, what specifically needs to be done, and what success looks like",
      "priority": "one of: HIGH, MEDIUM, LOW"
    }
  ]"""

_ANALYSIS_PROMPT_HEADER = """\
You are a data analysis expert. Analyze the provided spreadsheet data.

{criteria_block}

You MUST return ONLY valid JSON (no markdown, no explanation, no code fences) with this exact structure:

{{
{schema_body}
}}

Rules:
{rules}
- Return ONLY the JSON object, nothing else"""


class GenerationValidationError(ValueError):
    """Raised when Gemini JSON does not match the requested generation contract."""


def get_catalog() -> list[dict[str, str]]:
    return [dict(entry) for entry in CATALOG]


def normalize_generation_outputs(raw: Any) -> list[str]:
    """Parse and validate generation_outputs; default to all keys when omitted."""
    if raw is None or raw == '':
        return list(DEFAULT_GENERATION_OUTPUTS)
    if isinstance(raw, str):
        import json
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise GenerationValidationError(
                'generation_outputs must be a JSON array of strings.'
            ) from exc
    if not isinstance(raw, list):
        raise GenerationValidationError('generation_outputs must be a JSON array.')
    keys = []
    for item in raw:
        if not isinstance(item, str):
            raise GenerationValidationError('Each generation_outputs entry must be a string.')
        if item not in GENERATION_OUTPUT_KEYS:
            raise GenerationValidationError(
                f'Unknown generation output: {item}. '
                f'Allowed: {", ".join(sorted(GENERATION_OUTPUT_KEYS))}.'
            )
        if item not in keys:
            keys.append(item)
    if not keys:
        raise GenerationValidationError('At least one generation output must be selected.')
    return keys


def analysis_keys_for_request(requested: frozenset[str]) -> frozenset[str]:
    return requested & ANALYSIS_JSON_KEYS


def build_analysis_prompt(requested: frozenset[str], criteria_block: str) -> str:
    """Build Gemini system prompt for spreadsheet analysis (subset of keys)."""
    analysis_keys = analysis_keys_for_request(requested)
    if not analysis_keys:
        return (
            "You are a data analysis expert. The user did not request structured analysis "
            "fields from this call.\n\n"
            f"{criteria_block}\n\n"
            "Return ONLY valid JSON: {}\n"
            "No markdown, no explanation, no code fences."
        )
    parts = []
    if 'recommended_tasks' in analysis_keys:
        parts.append(_RECOMMENDED_TASKS_SCHEMA)
    schema_body = ',\n'.join(parts)
    rules = (
        '- Suggest 1-5 tasks based on the data when recommended_tasks is requested\n'
        '- If nothing actionable, return an empty recommended_tasks array\n'
    )
    return _ANALYSIS_PROMPT_HEADER.format(
        criteria_block=criteria_block,
        schema_body=schema_body,
        rules=rules,
    )


def _validate_recommended_tasks(value: Any) -> list:
    if not isinstance(value, list):
        raise GenerationValidationError('recommended_tasks must be a list.')
    for idx, task in enumerate(value):
        if not isinstance(task, dict):
            raise GenerationValidationError(f'recommended_tasks[{idx}] must be an object.')
        task_type = task.get('type')
        if not isinstance(task_type, str) or task_type not in _TASK_TYPES:
            raise GenerationValidationError(f'recommended_tasks[{idx}].type is invalid.')
        summary = task.get('summary')
        if not isinstance(summary, str) or not summary.strip():
            raise GenerationValidationError(f'recommended_tasks[{idx}].summary is required.')
        priority = task.get('priority')
        if not isinstance(priority, str) or priority not in _TASK_PRIORITIES:
            raise GenerationValidationError(f'recommended_tasks[{idx}].priority is invalid.')
    return value


def _validate_calendar_events(value: Any) -> list:
    if not isinstance(value, list):
        raise GenerationValidationError('calendar_events must be a list.')
    for idx, evt in enumerate(value):
        if not isinstance(evt, dict):
            raise GenerationValidationError(f'calendar_events[{idx}] must be an object.')
        for field in ('title', 'start_datetime', 'end_datetime'):
            if not isinstance(evt.get(field), str) or not str(evt.get(field)).strip():
                raise GenerationValidationError(
                    f'calendar_events[{idx}].{field} is required.'
                )
        for optional in ('location', 'description'):
            if optional in evt and evt[optional] is not None and not isinstance(evt[optional], str):
                raise GenerationValidationError(
                    f'calendar_events[{idx}].{optional} must be a string.'
                )
    return value


_VALIDATORS = {
    'recommended_tasks': _validate_recommended_tasks,
    'calendar_events': _validate_calendar_events,
}


def validate_analysis_response(data: dict, requested: frozenset[str]) -> dict:
    """Ensure analysis JSON has exactly the requested analysis keys."""
    if not isinstance(data, dict):
        raise GenerationValidationError('Analysis response must be a JSON object.')
    expected = analysis_keys_for_request(requested)
    actual = frozenset(data.keys())
    if actual != expected:
        missing = expected - actual
        extra = actual - expected
        parts = []
        if missing:
            parts.append(f'missing keys: {", ".join(sorted(missing))}')
        if extra:
            parts.append(f'unexpected keys: {", ".join(sorted(extra))}')
        raise GenerationValidationError(
            f'Analysis JSON key mismatch ({"; ".join(parts)}).'
        )
    result = {}
    for key in expected:
        result[key] = _VALIDATORS[key](data[key])
    return result


def validate_calendar_events_response(data: dict) -> dict:
    """Dedicated calendar generation call must return only calendar_events."""
    if not isinstance(data, dict):
        raise GenerationValidationError('Calendar response must be a JSON object.')
    if frozenset(data.keys()) != frozenset({'calendar_events'}):
        raise GenerationValidationError(
            'Calendar JSON must contain only the calendar_events key.'
        )
    return {'calendar_events': _validate_calendar_events(data['calendar_events'])}


def filter_sse_analysis_payload(analysis: dict, requested: frozenset[str]) -> dict:
    """Return only analysis keys the user requested for SSE."""
    return {
        k: v
        for k, v in analysis.items()
        if k in analysis_keys_for_request(requested)
    }


def should_skip_workflow_step(step_type: str, requested: frozenset[str]) -> bool:
    if step_type == 'create_tasks' and 'recommended_tasks' not in requested:
        return True
    if step_type in ('generate_miro_snapshot', 'create_miro_board') and 'miro_board' not in requested:
        return True
    return False


_CALENDAR_FROM_ANALYSIS_SYSTEM = """\
You are a calendar planning assistant. Based on spreadsheet analysis context, suggest \
follow-up calendar events the user may want to schedule (reviews, check-ins, deadlines).

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:

{
  "calendar_events": [
    {
      "title": "event title",
      "start_datetime": "YYYY-MM-DDTHH:MM:SS",
      "end_datetime": "YYYY-MM-DDTHH:MM:SS",
      "location": "optional location",
      "description": "optional description"
    }
  ]
}

Rules:
- Suggest 0-5 events when appropriate; use an empty array if none are warranted.
- Datetimes must be ISO-like strings without timezone offset.
- Return ONLY the JSON object, nothing else."""


def build_calendar_from_analysis_user_prompt(
    column_summary: str,
    cleaned_data: str,
    analysis_result: dict | None,
) -> str:
    analysis_blob = ''
    if analysis_result:
        import json
        analysis_blob = json.dumps(analysis_result, default=str)
    return (
        f"Data summary: {column_summary}\n\n"
        f"Spreadsheet sample rows:\n{cleaned_data}\n\n"
        f"Analysis context (if any):\n{analysis_blob or '{}'}\n\n"
        "Suggest calendar events the user should consider scheduling."
    )


def calendar_from_analysis_system_prompt() -> str:
    return _CALENDAR_FROM_ANALYSIS_SYSTEM
