"""Blueprint types and normalization stubs (validation expanded in qs-1.2)."""

from __future__ import annotations

from typing import Any, Mapping

from core.services.quick_start.constants import BLUEPRINT_VERSION, DEFAULT_SELECTED_MODULES


def normalize_selected_modules(raw: Mapping[str, Any] | None) -> dict[str, bool]:
    """Merge client module toggles with Quick Start defaults."""
    merged = dict(DEFAULT_SELECTED_MODULES)
    if not raw:
        return merged
    for key in merged:
        if key in raw and isinstance(raw[key], bool):
            merged[key] = raw[key]
    return merged


def empty_blueprint() -> dict[str, Any]:
    """Canonical empty blueprint shape for tests and placeholders."""
    return {
        'version': BLUEPRINT_VERSION,
        'project': {'name': '', 'description': ''},
        'tasks': [],
        'spreadsheets': [],
        'calendar_events': [],
        'decisions': [],
        'miro_boards': [],
    }
