from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from behavioral_tracking.models import BehavioralSignal, FocusSession
from behavioral_tracking.services import BehavioralTrackingService


SESSION_LIST_URL = "/api/behavioral-tracking/sessions/"


def _signal_payload(now=None, **overrides):
    now = now or timezone.now()
    base = {
        "window_started_at": now.isoformat(),
        "window_ended_at": (now + timedelta(seconds=30)).isoformat(),
        "focused_ms": 1000,
        "keystroke_count": 2,
        "backspace_count": 1,
        "tab_switch_count": 0,
        "rapid_switch_count": 0,
        "mouse_hesitation_count": 0,
        "inactivity_pause_count": 0,
        "repeated_navigation_count": 0,
        "abnormal_interruption_count": 0,
    }
    base.update(overrides)
    return base


def _detail_url(pk):
    return f"{SESSION_LIST_URL}{pk}/"


def _end_url(pk):
    return f"{SESSION_LIST_URL}{pk}/end/"


def _signals_url(pk):
    return f"{SESSION_LIST_URL}{pk}/signals/"


@pytest.fixture
def authed_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def other_user(organization):
    import uuid
    from django.contrib.auth import get_user_model

    User = get_user_model()
    suffix = uuid.uuid4().hex[:10]
    return User.objects.create_user(
        username=f"bt_other_{suffix}",
        email=f"bt_other_{suffix}@test.com",
        password="testpass123",
        organization=organization,
    )


@pytest.mark.django_db
def test_create_session_authenticated(authed_client, task):
    resp = authed_client.post(SESSION_LIST_URL, {"task": task.id}, format="json")
    assert resp.status_code == status.HTTP_201_CREATED, resp.content
    body = resp.json()
    assert body["task"] == task.id
    assert body["is_active"] is True
    assert FocusSession.objects.filter(pk=body["id"]).exists()


@pytest.mark.django_db
def test_create_session_unauthenticated_401(task):
    client = APIClient()
    resp = client.post(SESSION_LIST_URL, {"task": task.id}, format="json")
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_create_session_user_is_request_user(authed_client, task, user, other_user):
    resp = authed_client.post(
        SESSION_LIST_URL,
        {"task": task.id, "user": other_user.id},
        format="json",
    )
    assert resp.status_code == status.HTTP_201_CREATED, resp.content
    session = FocusSession.objects.get(pk=resp.json()["id"])
    assert session.user_id == user.id
    assert session.user_id != other_user.id


@pytest.mark.django_db
def test_list_sessions_filtered_by_task(authed_client, task, user, project):
    import uuid

    from task.models import Task

    other_task = Task.objects.create(
        summary=f"BT other task {uuid.uuid4().hex[:6]}",
        project=project,
        owner=user,
        type="execution",
    )
    s1 = BehavioralTrackingService.start_session(user=user, task=task)
    BehavioralTrackingService.start_session(user=user, task=other_task)

    resp = authed_client.get(SESSION_LIST_URL, {"task_id": task.id})
    assert resp.status_code == status.HTTP_200_OK
    results = resp.json().get("results", resp.json())
    ids = {r["id"] for r in results}
    assert s1.id in ids
    assert len(ids) == 1


@pytest.mark.django_db
def test_list_sessions_only_returns_own(authed_client, task, user, other_user):
    own = BehavioralTrackingService.start_session(user=user, task=task)
    foreign = BehavioralTrackingService.start_session(user=other_user, task=task)

    resp = authed_client.get(SESSION_LIST_URL)
    assert resp.status_code == status.HTTP_200_OK
    results = resp.json().get("results", resp.json())
    ids = {r["id"] for r in results}
    assert own.id in ids
    assert foreign.id not in ids


@pytest.mark.django_db
def test_retrieve_other_users_session_404(authed_client, task, other_user):
    foreign = BehavioralTrackingService.start_session(user=other_user, task=task)
    resp = authed_client.get(_detail_url(foreign.id))
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_end_session_returns_aggregates(authed_client, focus_session):
    now = timezone.now()
    BehavioralSignal.objects.create(
        session=focus_session,
        window_started_at=now,
        window_ended_at=now + timedelta(seconds=30),
        focused_ms=100,
        keystroke_count=10,
    )
    BehavioralSignal.objects.create(
        session=focus_session,
        window_started_at=now + timedelta(seconds=30),
        window_ended_at=now + timedelta(seconds=60),
        focused_ms=50,
        keystroke_count=5,
    )

    resp = authed_client.post(_end_url(focus_session.id))
    assert resp.status_code == status.HTTP_200_OK, resp.content
    body = resp.json()
    assert body["ended_at"] is not None
    assert body["is_active"] is False
    assert body["total_focused_ms"] == 150
    assert body["total_keystrokes"] == 15


@pytest.mark.django_db
def test_end_session_of_another_user_404(authed_client, task, other_user):
    foreign = BehavioralTrackingService.start_session(user=other_user, task=task)
    resp = authed_client.post(_end_url(foreign.id))
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_post_signals_batch_201(authed_client, focus_session):
    now = timezone.now()
    payload = {
        "signals": [
            _signal_payload(now=now),
            _signal_payload(now=now + timedelta(seconds=30)),
            _signal_payload(now=now + timedelta(seconds=60)),
        ]
    }
    resp = authed_client.post(
        _signals_url(focus_session.id), payload, format="json"
    )
    assert resp.status_code == status.HTTP_201_CREATED, resp.content
    assert len(resp.json()) == 3
    assert focus_session.signals.count() == 3


@pytest.mark.django_db
def test_post_signals_validation_error_400(authed_client, focus_session):
    payload = {"signals": [_signal_payload(keystroke_count=-1)]}
    resp = authed_client.post(
        _signals_url(focus_session.id), payload, format="json"
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert focus_session.signals.count() == 0


@pytest.mark.django_db
def test_get_signals_paginated(authed_client, focus_session):
    now = timezone.now()
    for i in range(3):
        BehavioralSignal.objects.create(
            session=focus_session,
            window_started_at=now + timedelta(seconds=30 * i),
            window_ended_at=now + timedelta(seconds=30 * (i + 1)),
            focused_ms=10 * (i + 1),
        )

    resp = authed_client.get(_signals_url(focus_session.id))
    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert "results" in body
    assert "count" in body
    assert body["count"] == 3
    assert len(body["results"]) == 3


@pytest.mark.django_db
def test_post_signals_after_end_400(authed_client, focus_session):
    BehavioralTrackingService.end_session(focus_session)
    payload = {"signals": [_signal_payload()]}
    resp = authed_client.post(
        _signals_url(focus_session.id), payload, format="json"
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
