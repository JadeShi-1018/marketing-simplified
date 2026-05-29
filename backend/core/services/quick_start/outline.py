"""Build read-only preview outlines from a validated blueprint."""

from __future__ import annotations

from typing import Any


def _event_start_label(event: dict[str, Any]) -> str:
    start = event.get('start_datetime') or ''
    if 'T' in start:
        return start.split('T')[0]
    return start[:10] if start else ''


def build_outline(blueprint: dict[str, Any], selected_modules: dict[str, bool]) -> dict[str, Any]:
    """Shape outline for the preview UI (titles and counts only)."""
    project = blueprint.get('project') or {}
    tasks = blueprint.get('tasks') or []
    spreadsheets = blueprint.get('spreadsheets') or []
    events = blueprint.get('calendar_events') or []
    decisions = blueprint.get('decisions') or []
    miro_boards = blueprint.get('miro_boards') or []

    outline: dict[str, Any] = {
        'project': {
            'title': project.get('name') or '',
            'description': project.get('description') or '',
        },
        'modules': {},
        'tasks': [{'summary': t.get('summary', '')} for t in tasks],
        'spreadsheets': [],
        'calendar_events': [
            {'title': e.get('title', ''), 'start_date': _event_start_label(e)} for e in events
        ],
        'decisions': [{'title': d.get('title', '')} for d in decisions],
        'miro_boards': [
            {
                'name': b.get('name', ''),
                'sticky_notes': [
                    str(n.get('content', ''))
                    for n in (b.get('sticky_notes') or [])
                    if n.get('content')
                ],
            }
            for b in miro_boards
        ],
    }

    for key, enabled in selected_modules.items():
        if key == 'tasks':
            outline['modules'][key] = {'enabled': enabled, 'count': len(tasks) if enabled else 0}
        elif key == 'spreadsheet':
            count = len(spreadsheets) if enabled else 0
            outline['modules'][key] = {'enabled': enabled, 'count': count}
            if enabled:
                for ss in spreadsheets:
                    sheet = (ss.get('sheets') or [{}])[0]
                    columns = sheet.get('columns') or []
                    rows = sheet.get('rows') or []
                    outline['spreadsheets'].append(
                        {
                            'name': ss.get('name', ''),
                            'sheet_name': sheet.get('name', ''),
                            'column_names': [c.get('name', '') for c in columns],
                            'row_count': len(rows),
                        }
                    )
        elif key == 'calendar':
            outline['modules'][key] = {
                'enabled': enabled,
                'count': len(events) if enabled else 0,
            }
        else:
            items = blueprint.get(
                'decisions' if key == 'decisions' else 'miro_boards' if key == 'miro' else key,
                [],
            )
            if key == 'decisions':
                count = len(items) if enabled else 0
            elif key == 'miro':
                count = (
                    sum(len(b.get('sticky_notes') or []) for b in items)
                    if enabled
                    else 0
                )
            else:
                count = 0
            outline['modules'][key] = {'enabled': enabled, 'count': count}

    return outline
