"""
Gantt chart payload for the tasks workspace.

Derives bar positions from ``planned_start_date`` / ``start_date`` and ``due_date``,
with deterministic fallbacks when dates are missing. "Risk" bands follow the
reference UI: they map from task priority (urgent / high / medium / low).
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Tuple

from task.models import Task

# Short codes for the left label (Jira-style key), aligned with Task.type choices.
_TYPE_PREFIX: Dict[str, str] = {
    "budget": "BUD",
    "asset": "AST",
    "retrospective": "RET",
    "report": "RPT",
    "execution": "EXE",
    "scaling": "SCL",
    "alert": "ALT",
    "experiment": "EXP",
    "optimization": "OPT",
    "communication": "COM",
    "platform_policy_update": "POL",
}

_DEFAULT_INCLUSIVE_SPAN = 7  # when inferring a range from a single anchor date


def _type_prefix(task_type: str) -> str:
    if task_type in _TYPE_PREFIX:
        return _TYPE_PREFIX[task_type]
    t = (task_type or "task").replace("_", "")
    return (t[:3] or "TSK").upper()


def _user_initials(user) -> str:
    if not user:
        return "?"
    first = (getattr(user, "first_name", None) or "").strip()
    last = (getattr(user, "last_name", None) or "").strip()
    if first and last:
        return f"{first[0]}{last[0]}".upper()
    uname = (getattr(user, "username", None) or "").strip()
    if uname:
        parts = uname.replace(".", " ").replace("_", " ").split()
        if len(parts) >= 2:
            return f"{parts[0][0]}{parts[1][0]}".upper()
        return uname[:2].upper()
    email = (getattr(user, "email", None) or "").strip()
    if email:
        return email[:2].upper()
    return "?"


def _owner_color_index(user) -> int:
    if not user or not getattr(user, "id", None):
        return 0
    return int(user.id) % 4


def _priority_band(task: Task) -> str:
    p = task.priority or Task.Priority.MEDIUM
    if p == Task.Priority.HIGHEST:
        return "highest"
    if p == Task.Priority.HIGH:
        return "high"
    if p == Task.Priority.MEDIUM:
        return "medium"
    if p == Task.Priority.LOW:
        return "low"
    return "lowest"


def _status_label(task: Task) -> str:
    try:
        return task.get_status_display()
    except Exception:
        return str(task.status or "")


def _compute_bar_bounds(task: Task, today: date) -> Tuple[date, date]:
    raw_start = task.planned_start_date or task.start_date
    raw_end = task.due_date

    span = _DEFAULT_INCLUSIVE_SPAN
    delta = timedelta(days=span - 1)

    if raw_start and raw_end:
        start, end = raw_start, raw_end
        if end < start:
            end = start
        return start, end

    if raw_end and not raw_start:
        start = raw_end - delta
        return start, raw_end

    if raw_start and not raw_end:
        end = raw_start + delta
        return raw_start, end

    # No dates: short horizon from today
    return today, today + delta


def _inclusive_days(start: date, end: date) -> int:
    return max(1, (end - start).days + 1)


def _chart_bounds(rows: List[Dict[str, Any]], today: date) -> Tuple[date, date]:
    if not rows:
        return today, today + timedelta(days=13)

    # Row dicts store ISO date strings; must parse before date arithmetic.
    starts = [date.fromisoformat(r["bar_start"]) for r in rows]
    ends = [date.fromisoformat(r["bar_end"]) for r in rows]
    mn = min(starts)
    mx = max(ends)
    pad = timedelta(days=2)
    start = mn - pad
    end = mx + pad
    if (end - start).days < 13:
        end = start + timedelta(days=13)
    return start, end


def build_gantt_payload(
    tasks: List[Task],
    *,
    today: date,
    sprint_label: str,
) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    for task in tasks:
        bar_start, bar_end = _compute_bar_bounds(task, today)
        duration = _inclusive_days(bar_start, bar_end)
        owner = task.owner
        rows.append(
            {
                "id": task.id,
                "display_key": f"{_type_prefix(task.type)}-{task.id}",
                "summary": task.summary,
                "status_label": _status_label(task),
                "priority": task.priority,
                "band": _priority_band(task),
                "owner_initials": _user_initials(owner),
                "owner_color_index": _owner_color_index(owner),
                "bar_start": bar_start.isoformat(),
                "bar_end": bar_end.isoformat(),
                "duration_days": duration,
            }
        )

    range_start, range_end = _chart_bounds(rows, today)

    return {
        "sprint_label": sprint_label,
        "task_count": len(rows),
        "today": today.isoformat(),
        "range": {
            "start": range_start.isoformat(),
            "end": range_end.isoformat(),
        },
        "legend": [
            {"band": "highest", "label": "Highest"},
            {"band": "high", "label": "High"},
            {"band": "medium", "label": "Medium"},
            {"band": "low", "label": "Low"},
            {"band": "lowest", "label": "Lowest"},
        ],
        "rows": rows,
    }


def resolve_sprint_label_from_tasks(tasks: List[Task], fallback: str = "Timeline") -> str:
    for t in tasks:
        if getattr(t, "project", None) and getattr(t.project, "name", None):
            return t.project.name
    return fallback
