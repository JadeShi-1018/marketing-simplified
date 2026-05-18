from datetime import timedelta

import pytest
from django.db import IntegrityError
from django.utils import timezone

from behavioral_tracking.models import BehavioralSignal, FocusSession
from behavioral_tracking.services import BehavioralTrackingService


def _signal_item(**overrides):
    now = timezone.now()
    base = {
        "window_started_at": now,
        "window_ended_at": now + timedelta(seconds=30),
        "focused_ms": 1000,
        "keystroke_count": 2,
        "backspace_count": 1,
        "tab_switch_count": 1,
        "rapid_switch_count": 0,
        "mouse_hesitation_count": 0,
        "inactivity_pause_count": 0,
        "repeated_navigation_count": 0,
        "abnormal_interruption_count": 0,
    }
    base.update(overrides)
    return base


@pytest.mark.django_db
def test_start_session_creates_active(task, user):
    session = BehavioralTrackingService.start_session(user=user, task=task)

    assert session.pk is not None
    assert session.is_active is True
    assert session.task_id == task.id
    assert session.user_id == user.id
    assert FocusSession.objects.filter(pk=session.pk).exists()


@pytest.mark.django_db
def test_ingest_signals_bulk_creates_rows(focus_session):
    items = [_signal_item(focused_ms=100), _signal_item(focused_ms=200), _signal_item(focused_ms=300)]
    created = BehavioralTrackingService.ingest_signals(session=focus_session, items=items)

    assert len(created) == 3
    assert focus_session.signals.count() == 3
    assert sum(s.focused_ms for s in focus_session.signals.all()) == 600


@pytest.mark.django_db
def test_ingest_signals_atomic_rollback(focus_session):
    good = _signal_item(focused_ms=10)
    bad = _signal_item(focused_ms=-1)
    before = focus_session.signals.count()

    with pytest.raises(IntegrityError):
        BehavioralTrackingService.ingest_signals(session=focus_session, items=[good, bad])

    assert focus_session.signals.count() == before


@pytest.mark.django_db
def test_end_session_aggregates_totals(focus_session):
    now = timezone.now()
    BehavioralSignal.objects.create(
        session=focus_session,
        window_started_at=now,
        window_ended_at=now + timedelta(seconds=30),
        focused_ms=100,
        keystroke_count=10,
        backspace_count=2,
        tab_switch_count=3,
        rapid_switch_count=1,
        mouse_hesitation_count=4,
        inactivity_pause_count=1,
        repeated_navigation_count=2,
        abnormal_interruption_count=5,
    )
    BehavioralSignal.objects.create(
        session=focus_session,
        window_started_at=now + timedelta(seconds=30),
        window_ended_at=now + timedelta(seconds=60),
        focused_ms=50,
        keystroke_count=5,
        backspace_count=1,
        tab_switch_count=1,
        rapid_switch_count=0,
        mouse_hesitation_count=1,
        inactivity_pause_count=0,
        repeated_navigation_count=1,
        abnormal_interruption_count=1,
    )

    BehavioralTrackingService.end_session(focus_session)
    focus_session.refresh_from_db()

    assert focus_session.ended_at is not None
    assert focus_session.is_active is False
    assert focus_session.total_focused_ms == 150
    assert focus_session.total_keystrokes == 15
    assert focus_session.total_backspaces == 3
    assert focus_session.total_tab_switches == 4
    assert focus_session.total_rapid_switches == 1
    assert focus_session.total_mouse_hesitations == 5
    assert focus_session.total_inactivity_pauses == 1
    assert focus_session.total_repeated_navigations == 3
    assert focus_session.total_abnormal_interruptions == 6


@pytest.mark.django_db
def test_end_session_idempotent_on_already_ended(focus_session):
    BehavioralTrackingService.end_session(focus_session)
    focus_session.refresh_from_db()
    first_ended = focus_session.ended_at
    first_totals = (
        focus_session.total_focused_ms,
        focus_session.total_keystrokes,
    )

    BehavioralTrackingService.end_session(focus_session)
    focus_session.refresh_from_db()

    assert focus_session.ended_at == first_ended
    assert focus_session.total_focused_ms == first_totals[0]
    assert focus_session.total_keystrokes == first_totals[1]


@pytest.mark.django_db
def test_end_session_with_zero_signals(focus_session):
    BehavioralTrackingService.end_session(focus_session)
    focus_session.refresh_from_db()

    assert focus_session.ended_at is not None
    assert focus_session.total_focused_ms == 0
    assert focus_session.total_keystrokes == 0
    assert focus_session.total_backspaces == 0
    assert focus_session.total_tab_switches == 0
    assert focus_session.total_rapid_switches == 0
    assert focus_session.total_mouse_hesitations == 0
    assert focus_session.total_inactivity_pauses == 0
    assert focus_session.total_repeated_navigations == 0
    assert focus_session.total_abnormal_interruptions == 0
