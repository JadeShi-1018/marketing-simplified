from datetime import timedelta

import pytest
from django.utils import timezone

from behavioral_tracking.models import FocusSession
from behavioral_tracking.serializers import (
    MAX_SIGNALS_PER_BATCH,
    BehavioralSignalBatchSerializer,
    BehavioralSignalInputSerializer,
    FocusSessionCreateSerializer,
    FocusSessionSerializer,
)


def _signal_payload(now=None, **overrides):
    now = now or timezone.now()
    base = {
        "window_started_at": now.isoformat(),
        "window_ended_at": (now + timedelta(seconds=30)).isoformat(),
        "focused_ms": 10000,
        "keystroke_count": 5,
    }
    base.update(overrides)
    return base


@pytest.mark.django_db
def test_focus_session_serializer_output_shape(focus_session):
    data = FocusSessionSerializer(focus_session).data

    expected_keys = {
        "id",
        "task",
        "user",
        "started_at",
        "ended_at",
        "is_active",
        "total_focused_ms",
        "total_keystrokes",
        "total_backspaces",
        "total_tab_switches",
        "total_rapid_switches",
        "total_mouse_hesitations",
        "total_inactivity_pauses",
        "total_repeated_navigations",
        "total_abnormal_interruptions",
        "created_at",
        "updated_at",
    }
    assert set(data.keys()) == expected_keys
    assert data["is_active"] is True
    assert data["ended_at"] is None
    assert data["total_focused_ms"] == 0


@pytest.mark.django_db
def test_focus_session_create_serializer_ignores_user_in_payload(task, user):
    other_user_id = user.id + 9999
    serializer = FocusSessionCreateSerializer(
        data={"task": task.id, "user": other_user_id}
    )
    assert serializer.is_valid(), serializer.errors
    assert "user" not in serializer.validated_data
    assert serializer.validated_data["task"] == task

    session = FocusSession.objects.create(
        **serializer.validated_data, user=user
    )
    assert session.user_id == user.id
    assert session.user_id != other_user_id


def test_signal_input_invalid_window_rejected():
    now = timezone.now()
    payload = _signal_payload(
        now=now,
        window_started_at=now.isoformat(),
        window_ended_at=(now - timedelta(seconds=1)).isoformat(),
    )
    serializer = BehavioralSignalInputSerializer(data=payload)
    assert serializer.is_valid() is False
    assert "window_ended_at" in serializer.errors


def test_signal_input_negative_count_rejected():
    payload = _signal_payload(keystroke_count=-1)
    serializer = BehavioralSignalInputSerializer(data=payload)
    assert serializer.is_valid() is False
    assert "keystroke_count" in serializer.errors


def test_signal_batch_exceeds_limit_rejected():
    now = timezone.now()
    signals = [_signal_payload(now=now) for _ in range(MAX_SIGNALS_PER_BATCH + 1)]
    serializer = BehavioralSignalBatchSerializer(data={"signals": signals})
    assert serializer.is_valid() is False
    assert "signals" in serializer.errors


def test_signal_batch_at_limit_accepted():
    now = timezone.now()
    signals = [_signal_payload(now=now) for _ in range(MAX_SIGNALS_PER_BATCH)]
    serializer = BehavioralSignalBatchSerializer(data={"signals": signals})
    assert serializer.is_valid(), serializer.errors
    assert len(serializer.validated_data["signals"]) == MAX_SIGNALS_PER_BATCH
