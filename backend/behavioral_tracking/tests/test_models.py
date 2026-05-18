from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from behavioral_tracking.models import BehavioralSignal, FocusSession
from task.models import Task


@pytest.mark.django_db
def test_create_focus_session_with_defaults(task, user):
    session = FocusSession.objects.create(task=task, user=user)

    assert session.ended_at is None
    assert session.is_active is True
    assert session.total_focused_ms == 0
    assert session.total_keystrokes == 0
    assert session.total_backspaces == 0
    assert session.total_tab_switches == 0
    assert session.total_rapid_switches == 0
    assert session.total_mouse_hesitations == 0
    assert session.total_inactivity_pauses == 0
    assert session.total_repeated_navigations == 0
    assert session.total_abnormal_interruptions == 0
    assert session.started_at is not None


@pytest.mark.django_db
def test_focus_session_str(focus_session):
    text = str(focus_session)
    assert str(focus_session.task_id) in text
    assert str(focus_session.user_id) in text
    assert "FocusSession" in text


@pytest.mark.django_db
def test_focus_session_indexes_exist():
    idx_fields = {tuple(idx.fields) for idx in FocusSession._meta.indexes}
    assert ("user", "-started_at") in idx_fields
    assert ("task", "-started_at") in idx_fields


@pytest.mark.django_db
def test_signal_can_be_attached_to_session(focus_session):
    start = timezone.now()
    end = start + timedelta(seconds=30)
    signal = BehavioralSignal.objects.create(
        session=focus_session,
        window_started_at=start,
        window_ended_at=end,
        focused_ms=5000,
        keystroke_count=3,
    )

    assert focus_session.signals.count() == 1
    assert signal.recorded_at is not None
    assert signal.session_id == focus_session.id


@pytest.mark.django_db
def test_signal_negative_count_raises(focus_session):
    start = timezone.now()
    end = start + timedelta(seconds=30)
    with transaction.atomic():
        with pytest.raises(IntegrityError):
            BehavioralSignal.objects.create(
                session=focus_session,
                window_started_at=start,
                window_ended_at=end,
                keystroke_count=-1,
            )


@pytest.mark.django_db
def test_signal_window_invalid_raises(focus_session):
    start = timezone.now()
    end = start - timedelta(seconds=1)
    with transaction.atomic():
        with pytest.raises(IntegrityError):
            BehavioralSignal.objects.create(
                session=focus_session,
                window_started_at=start,
                window_ended_at=end,
            )


@pytest.mark.django_db
def test_cascade_delete_task_deletes_sessions_and_signals(task, user):
    session = FocusSession.objects.create(task=task, user=user)
    start = timezone.now()
    BehavioralSignal.objects.create(
        session=session,
        window_started_at=start,
        window_ended_at=start + timedelta(seconds=30),
    )
    sid, tid = session.id, task.id

    task.delete()

    assert not FocusSession.objects.filter(pk=sid).exists()
    assert not BehavioralSignal.objects.filter(session_id=sid).exists()
    assert not Task.objects.filter(pk=tid).exists()


@pytest.mark.django_db
def test_focus_session_ended_marks_inactive(focus_session):
    assert focus_session.is_active is True

    focus_session.ended_at = timezone.now()
    focus_session.save(update_fields=["ended_at"])

    focus_session.refresh_from_db()
    assert focus_session.is_active is False
