"""Rule-based campaign brief extraction for Quick Start prompts."""

from __future__ import annotations

import re
from typing import Any, Mapping

from core.services.quick_start.dates import quick_start_today

_BUDGET_RE = re.compile(
    r'(?:\$|USD\s*|€|£)\s*([\d,]+(?:\.\d+)?)\s*(k|K|m|M)?|'
    r'([\d,]+(?:\.\d+)?)\s*(k|K|m|M)?\s*(?:USD|dollars?|budget)',
    re.IGNORECASE,
)
_DURATION_RE = re.compile(
    r'(\d+)\s*(?:weeks?|wks?|months?|days?)',
    re.IGNORECASE,
)
_DATE_RANGE_RE = re.compile(
    r'(\d{4}-\d{2}-\d{2})\s*(?:to|–|-|—)\s*(\d{4}-\d{2}-\d{2})',
    re.IGNORECASE,
)


def _normalize_budget_match(groups: tuple[Any, ...]) -> str | None:
    amount = groups[0] or groups[2]
    suffix = (groups[1] or groups[3] or '').lower()
    if not amount:
        return None
    text = amount.replace(',', '')
    if suffix == 'k':
        text = str(float(text) * 1000)
    elif suffix == 'm':
        text = str(float(text) * 1_000_000)
    return f'${text}'


def extract_budget_hint(*texts: str) -> str | None:
    for text in texts:
        if not text:
            continue
        match = _BUDGET_RE.search(text)
        if match:
            return _normalize_budget_match(match.groups())
    return None


def extract_duration_hint(*texts: str) -> str | None:
    for text in texts:
        if not text:
            continue
        match = _DURATION_RE.search(text)
        if match:
            span = match.group(0)
            return span.strip()
    return None


def extract_date_range_hint(*texts: str) -> str | None:
    for text in texts:
        if not text:
            continue
        match = _DATE_RANGE_RE.search(text)
        if match:
            return f'{match.group(1)} to {match.group(2)}'
    return None


def build_campaign_brief(
    *,
    prompt: str,
    supplement: str | None,
    chips: Mapping[str, Any] | None,
    locale: str | None,
) -> dict[str, Any]:
    """Structured facts derived from user input (no LLM)."""
    chips_dict = dict(chips or {})
    channels = chips_dict.get('channels') or []
    objectives = chips_dict.get('objectives') or []
    if not isinstance(channels, list):
        channels = []
    if not isinstance(objectives, list):
        objectives = []

    narrative_parts = [prompt.strip()]
    if supplement and supplement.strip():
        narrative_parts.append(supplement.strip())
    narrative = '\n\n'.join(part for part in narrative_parts if part)

    return {
        'today': quick_start_today().isoformat(),
        'locale': locale,
        'channels': [str(c) for c in channels if c],
        'objectives': [str(o) for o in objectives if o],
        'budget_hint': extract_budget_hint(prompt, supplement or ''),
        'duration_hint': extract_duration_hint(prompt, supplement or ''),
        'date_range_hint': extract_date_range_hint(prompt, supplement or ''),
        'narrative': narrative,
    }
