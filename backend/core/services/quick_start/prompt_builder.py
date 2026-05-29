"""Build LLM user prompts for Quick Start (two-stage: plan → blueprint)."""

from __future__ import annotations

import json
from typing import Any, Mapping

from core.services.quick_start.plan_schema import CAMPAIGN_PLAN_JSON_SCHEMA_HINT
from core.services.quick_start.schema import BLUEPRINT_JSON_SCHEMA_HINT


def _format_enabled_modules(selected_modules: dict[str, bool]) -> tuple[list[str], list[str]]:
    enabled = [key for key, on in selected_modules.items() if on]
    disabled = [key for key, on in selected_modules.items() if not on]
    return enabled, disabled


def _format_brief_facts(brief: Mapping[str, Any]) -> str:
    """Structured facts only (for stage 2 — narrative is already in the CampaignPlan)."""
    lines = [
        '## Campaign facts',
        f'- Today: {brief.get("today")}',
    ]
    if brief.get('locale'):
        lines.append(f'- Locale: {brief.get("locale")}')
    if brief.get('channels'):
        lines.append(f'- Channels: {", ".join(brief["channels"])}')
    if brief.get('objectives'):
        lines.append(f'- Objectives: {", ".join(brief["objectives"])}')
    if brief.get('budget_hint'):
        lines.append(f'- Budget: {brief["budget_hint"]}')
    if brief.get('duration_hint'):
        lines.append(f'- Duration: {brief["duration_hint"]}')
    if brief.get('date_range_hint'):
        lines.append(f'- Date range: {brief["date_range_hint"]}')
    return '\n'.join(lines)


def _format_brief_section(brief: Mapping[str, Any]) -> str:
    lines = [
        '## Structured brief',
        f'- Today: {brief.get("today")}',
    ]
    if brief.get('locale'):
        lines.append(f'- Locale: {brief.get("locale")}')
    if brief.get('channels'):
        lines.append(f'- Channels: {", ".join(brief["channels"])}')
    if brief.get('objectives'):
        lines.append(f'- Objectives: {", ".join(brief["objectives"])}')
    if brief.get('budget_hint'):
        lines.append(f'- Budget (from user): {brief["budget_hint"]}')
    if brief.get('duration_hint'):
        lines.append(f'- Duration (from user): {brief["duration_hint"]}')
    if brief.get('date_range_hint'):
        lines.append(f'- Date range (from user): {brief["date_range_hint"]}')
    lines.extend(['', '## User narrative', str(brief.get('narrative') or '').strip()])
    return '\n'.join(lines)


def build_plan_user_prompt(
    *,
    brief: Mapping[str, Any],
    selected_modules: dict[str, bool],
) -> str:
    enabled, disabled = _format_enabled_modules(selected_modules)
    parts = [
        'Create a CampaignPlan (stage 1) for a new media-buying project.',
        '',
        _format_brief_section(brief),
        '',
        '## Module scope',
        f'Plan content for enabled modules: {", ".join(enabled) or "none"}',
        f'Do not include sections for disabled modules: {", ".join(disabled) or "none"}',
        '',
        '## Module planning checklist',
        '- tasks: one row per major deliverable/milestone the user implied; vary types and priorities.',
        '- spreadsheet: column names from user metrics; row_themes describe realistic sample lines.',
        '- calendar: milestones with clear timing_hint across the flight.',
        '- decisions: genuine tradeoffs (budget, channel, creative, pacing).',
        '- miro: board_name + sticky_themes for workshop topics.',
        '',
        'Schema:',
        CAMPAIGN_PLAN_JSON_SCHEMA_HINT,
    ]
    return '\n'.join(parts)


def build_blueprint_user_prompt(
    *,
    brief: Mapping[str, Any],
    plan: Mapping[str, Any],
    selected_modules: dict[str, bool],
) -> str:
    enabled, disabled = _format_enabled_modules(selected_modules)
    plan_json = json.dumps(dict(plan), ensure_ascii=False, separators=(',', ':'))
    parts = [
        'Expand the CampaignPlan below into a complete ProjectBlueprint (stage 2).',
        'Output exactly one JSON object matching the schema (not an array, not markdown).',
        '',
        _format_brief_facts(brief),
        '',
        '## Approved CampaignPlan (follow this structure)',
        plan_json,
        '',
        '## Module scope',
        f'Include arrays for enabled modules: {", ".join(enabled) or "none"}',
        f'Use empty arrays for disabled modules: {", ".join(disabled) or "none"}',
        '',
        '## Expansion rules',
        '- At least 5 tasks if tasks enabled; dates on or after brief.today.',
        '- Spreadsheet: at least 3 columns and 2 data rows reflecting row_themes.',
        '- Calendar: ISO datetimes from calendar_plan timing; end after start.',
        '- Decisions: at least 2 if enabled, with descriptions from plan.',
        '- Miro: at least 1 board and 2 sticky_notes from sticky_themes.',
        '',
        'Schema:',
        BLUEPRINT_JSON_SCHEMA_HINT,
    ]
    return '\n'.join(parts)
