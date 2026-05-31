"""Normalize Quick Start blueprint dates so nothing is before today."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone as dt_timezone
from typing import Any

from django.utils import timezone
from django.utils.dateparse import parse_datetime

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')

# Keep generated milestones within a plausible campaign window (not years apart).
MAX_CALENDAR_CLUSTER_OFFSET_DAYS = 45
MAX_CALENDAR_POST_CAMPAIGN_DAYS = 14
MAX_CALENDAR_PRE_LAUNCH_DAYS = 21


def quick_start_today() -> date:
    return timezone.localdate()


def normalize_quick_start_date(value: str | None) -> str | None:
    """
    Return YYYY-MM-DD on or after today, shifting stale LLM years forward.
    """
    if not value:
        return None
    if not DATE_RE.match(value):
        return value

    parsed = date.fromisoformat(value)
    today = quick_start_today()

    if parsed.year < today.year:
        parsed = parsed.replace(year=today.year)

    if parsed < today:
        return today.isoformat()

    return parsed.isoformat()


def normalize_quick_start_task_dates(
    planned_start_date: str | None,
    due_date: str | None,
) -> tuple[str | None, str | None]:
    planned = normalize_quick_start_date(planned_start_date)
    due = normalize_quick_start_date(due_date)

    if planned and due:
        if date.fromisoformat(due) < date.fromisoformat(planned):
            due = planned
    return planned, due


def _ensure_aware(dt: datetime) -> datetime:
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, dt_timezone.utc)
    return dt


def _align_datetimes_not_before_now(
    start: datetime, end: datetime
) -> tuple[datetime, datetime]:
    now = timezone.now()
    start = _ensure_aware(start)
    end = _ensure_aware(end)
    today = quick_start_today()

    if start.date().year < today.year:
        year_shift = today.year - start.date().year
        start = start.replace(year=start.year + year_shift)
        end = end.replace(year=end.year + year_shift)

    if start < now:
        duration = end - start
        if duration <= timedelta(0):
            duration = timedelta(hours=1)
        start = now
        end = start + duration

    if end <= start:
        end = start + timedelta(hours=1)

    return start, end


def _datetime_to_iso_z(dt: datetime) -> str:
    aware = _ensure_aware(dt).astimezone(dt_timezone.utc)
    return aware.replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def normalize_quick_start_datetime_range(
    start_datetime: str, end_datetime: str
) -> tuple[str, str]:
    start = parse_datetime(start_datetime.replace('Z', '+00:00'))
    end = parse_datetime(end_datetime.replace('Z', '+00:00'))
    if start is None or end is None:
        raise ValueError('Invalid ISO-8601 datetime.')

    start, end = _align_datetimes_not_before_now(start, end)
    return _datetime_to_iso_z(start), _datetime_to_iso_z(end)


def _parse_iso_datetime(value: str) -> datetime:
    parsed = parse_datetime(value.replace('Z', '+00:00'))
    if parsed is None:
        raise ValueError('Invalid ISO-8601 datetime.')
    return _ensure_aware(parsed)


def _median_datetime(values: list[datetime]) -> datetime:
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def _align_calendar_event_to_window(
    *,
    start: datetime,
    end: datetime,
    anchor_start: datetime,
    anchor_end: datetime,
) -> tuple[datetime, datetime]:
    duration = end - start
    if duration <= timedelta(0):
        duration = timedelta(hours=1)

    if start > anchor_end + timedelta(days=MAX_CALENDAR_POST_CAMPAIGN_DAYS):
        start = anchor_start - timedelta(days=min(MAX_CALENDAR_PRE_LAUNCH_DAYS, 7))
        end = start + duration
    elif start < anchor_start - timedelta(days=MAX_CALENDAR_PRE_LAUNCH_DAYS):
        start = anchor_start
        end = start + duration

    if end <= start:
        end = start + timedelta(hours=1)
    return start, end


def normalize_quick_start_calendar_events(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Normalize, sort chronologically, and pull outliers into the main campaign window.
    """
    if not events:
        return []

    normalized: list[dict[str, Any]] = []
    for event in events:
        start, end = normalize_quick_start_datetime_range(
            event['start_datetime'],
            event['end_datetime'],
        )
        normalized.append({**event, 'start_datetime': start, 'end_datetime': end})

    if len(normalized) < 2:
        return normalized

    parsed_ranges = [
        (
            _parse_iso_datetime(item['start_datetime']),
            _parse_iso_datetime(item['end_datetime']),
        )
        for item in normalized
    ]
    starts = [start for start, _ in parsed_ranges]
    median_start = _median_datetime(starts)
    cluster_indices = [
        index
        for index, start in enumerate(starts)
        if abs((start - median_start).days) <= MAX_CALENDAR_CLUSTER_OFFSET_DAYS
    ]
    if len(cluster_indices) < 2:
        filtered = [
            index
            for index, start in enumerate(starts)
            if start.year <= median_start.year + 1
            and abs((start - median_start).days) <= MAX_CALENDAR_CLUSTER_OFFSET_DAYS * 3
        ]
        cluster_indices = filtered if len(filtered) >= 2 else list(range(len(normalized)))

    anchor_start = min(starts[index] for index in cluster_indices)
    anchor_end = max(parsed_ranges[index][1] for index in cluster_indices)

    aligned: list[dict[str, Any]] = []
    for item, (start, end) in zip(normalized, parsed_ranges, strict=True):
        start, end = _align_calendar_event_to_window(
            start=start,
            end=end,
            anchor_start=anchor_start,
            anchor_end=anchor_end,
        )
        start, end = _align_datetimes_not_before_now(start, end)
        aligned.append(
            {
                **item,
                'start_datetime': _datetime_to_iso_z(start),
                'end_datetime': _datetime_to_iso_z(end),
            }
        )

    aligned.sort(key=lambda row: row['start_datetime'])
    return aligned


def normalize_quick_start_spreadsheet_cell(value: str) -> str:
    text = str(value).strip()
    if DATE_RE.match(text):
        normalized = normalize_quick_start_date(text)
        return normalized or text
    return str(value)
