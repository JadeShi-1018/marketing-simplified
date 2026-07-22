"""
Business-hours math for SLA countdowns.

Pure stdlib (datetime + zoneinfo) so the calendar math is testable without
Django or a database. Callers pass a calendar's ``schedule`` + ``timezone``.
A ticket with no calendar counts down against plain wall-clock, so these
helpers are only used when a calendar is attached.

``schedule`` reuses the operating-hours shape support channels already use
(see csm.models.default_operating_hours):

    {"monday": {"enabled": True, "start": "09:00", "end": "17:00"},
     ...,
     "sunday": {"enabled": False}}

A full 24-hour day is expressed as "no calendar" (wall-clock), never as a
00:00-23:59 window, so the schedule never needs the unreachable 24:00.
"""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

# Index matches datetime.weekday(): Monday == 0.
WEEKDAYS = (
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
)

# A calendar with zero open hours would otherwise loop forever.
_HORIZON_DAYS = 366 * 10


def _day_window(local_date, day_cfg, tz):
    """Aware (open_start, open_end) for a date, or None when closed or malformed."""
    if not isinstance(day_cfg, dict) or not day_cfg.get('enabled'):
        return None
    start, end = day_cfg.get('start'), day_cfg.get('end')
    if not start or not end:
        return None
    try:
        sh, sm = (int(x) for x in start.split(':'))
        eh, em = (int(x) for x in end.split(':'))
    except (ValueError, AttributeError):
        return None
    open_start = datetime.combine(local_date, time(sh, sm), tzinfo=tz)
    open_end = datetime.combine(local_date, time(eh, em), tzinfo=tz)
    if open_end <= open_start:
        return None
    return open_start, open_end


def minutes_open_between(start, end, schedule, tz_name):
    """Business minutes inside [start, end] per the weekly schedule.

    ``start`` / ``end`` are timezone-aware datetimes (UTC from the DB).
    """
    if end <= start:
        return 0.0
    tz = ZoneInfo(tz_name)
    total = 0.0
    day = start.astimezone(tz).date()
    last = end.astimezone(tz).date()
    while day <= last:
        window = _day_window(day, schedule.get(WEEKDAYS[day.weekday()]), tz)
        if window:
            lo = max(window[0], start)
            hi = min(window[1], end)
            if hi > lo:
                total += (hi - lo).total_seconds() / 60.0
        day += timedelta(days=1)
    return total


def add_open_minutes(start, minutes, schedule, tz_name):
    """Datetime (UTC) reached after consuming ``minutes`` of business time from ``start``."""
    utc = ZoneInfo('UTC')
    if minutes <= 0:
        return start.astimezone(utc)
    tz = ZoneInfo(tz_name)
    remaining = float(minutes)
    day = start.astimezone(tz).date()
    for _ in range(_HORIZON_DAYS):
        window = _day_window(day, schedule.get(WEEKDAYS[day.weekday()]), tz)
        if window:
            seg_start = max(window[0], start)  # skip time already elapsed on the first day
            if window[1] > seg_start:
                avail = (window[1] - seg_start).total_seconds() / 60.0
                if avail >= remaining:
                    return (seg_start + timedelta(minutes=remaining)).astimezone(utc)
                remaining -= avail
        day += timedelta(days=1)
    raise ValueError('add_open_minutes: horizon exceeded (calendar has no open hours?)')


def _selfcheck():
    """Runnable assertions for the calendar math: ``python3 business_hours.py``."""
    utc = ZoneInfo('UTC')
    weekday = {'enabled': True, 'start': '09:00', 'end': '17:00'}  # 8h == 480 min
    off = {'enabled': False}
    sched = {d: weekday for d in WEEKDAYS[:5]}
    sched['saturday'] = off
    sched['sunday'] = off

    def dt(y, mo, d, h, mi=0, tz=utc):
        return datetime(y, mo, d, h, mi, tzinfo=tz)

    # 2024-01-01 is a Monday.
    assert minutes_open_between(dt(2024, 1, 1, 9), dt(2024, 1, 1, 17), sched, 'UTC') == 480
    assert minutes_open_between(dt(2024, 1, 1, 12), dt(2024, 1, 1, 13), sched, 'UTC') == 60
    # Before-open and after-close clamp to the window.
    assert minutes_open_between(dt(2024, 1, 1, 6), dt(2024, 1, 1, 20), sched, 'UTC') == 480
    # Fri 16:00 -> Mon 10:00: Fri 16-17 (60) + weekend (0) + Mon 9-10 (60).
    assert minutes_open_between(dt(2024, 1, 5, 16), dt(2024, 1, 8, 10), sched, 'UTC') == 120
    # Entirely on a closed day.
    assert minutes_open_between(dt(2024, 1, 6, 10), dt(2024, 1, 6, 12), sched, 'UTC') == 0
    assert minutes_open_between(dt(2024, 1, 1, 17), dt(2024, 1, 1, 9), sched, 'UTC') == 0

    assert add_open_minutes(dt(2024, 1, 1, 9), 480, sched, 'UTC') == dt(2024, 1, 1, 17)
    # 30 min left on Mon after 16:30 spills into Tue 09:00 for the other 30.
    assert add_open_minutes(dt(2024, 1, 1, 16, 30), 60, sched, 'UTC') == dt(2024, 1, 2, 9, 30)
    # Starting before open snaps to 09:00.
    assert add_open_minutes(dt(2024, 1, 1, 6), 60, sched, 'UTC') == dt(2024, 1, 1, 10)
    # Fri 16:00 + 120 -> Fri 16-17 (60) then Mon 09-10 (60) == Mon 10:00.
    assert add_open_minutes(dt(2024, 1, 5, 16), 120, sched, 'UTC') == dt(2024, 1, 8, 10)

    # Timezone is honoured: Sydney 9-5 (UTC+11 in January), asked in UTC.
    syd = 'Australia/Sydney'
    # 00:00-06:00 UTC on Mon == 11:00-17:00 Sydney -> 6 open hours.
    assert minutes_open_between(dt(2024, 1, 1, 0), dt(2024, 1, 1, 6), sched, syd) == 360

    print('business_hours self-check: OK')


if __name__ == '__main__':
    _selfcheck()
