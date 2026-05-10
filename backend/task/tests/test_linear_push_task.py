"""Tests for POST /api/v1/linear/push-task/ (sync task → Linear)."""

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Organization, Project, ProjectMember
from linear_integration.models import LinearCredential
from task.models import Task

User = get_user_model()
PUSH_URL = "/api/v1/linear/push-task/"


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
def test_push_task_requires_auth(api_client):
    r = api_client.post(PUSH_URL, {"task_id": 1}, format="json")
    assert r.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_push_task_requires_team_when_not_linked(organization, api_client):
    user = User.objects.create_user(
        username="linpush1",
        email="linpush1@test.com",
        password="x",
        organization=organization,
    )
    project = Project.objects.create(
        name="P1",
        organization=organization,
        owner=user,
        objectives=["awareness"],
        kpis={"ctr": {"target": 0.02}},
    )
    ProjectMember.objects.create(user=user, project=project, role="Team Leader", is_active=True)
    cred = LinearCredential(user=user)
    cred.set_access_token("fake-token")
    cred.save()
    task = Task.objects.create(
        summary="Local only",
        type="execution",
        project=project,
        owner=user,
    )
    api_client.force_authenticate(user=user)
    r = api_client.post(PUSH_URL, {"task_id": task.id}, format="json")
    assert r.status_code == status.HTTP_400_BAD_REQUEST
    assert "team_id" in (r.data.get("detail") or "").lower()


@pytest.mark.django_db
def test_push_task_updates_when_linked(organization, api_client):
    user = User.objects.create_user(
        username="linpush2",
        email="linpush2@test.com",
        password="x",
        organization=organization,
    )
    project = Project.objects.create(
        name="P2",
        organization=organization,
        owner=user,
        objectives=["awareness"],
        kpis={"ctr": {"target": 0.02}},
    )
    ProjectMember.objects.create(user=user, project=project, role="Team Leader", is_active=True)
    cred = LinearCredential(user=user)
    cred.set_access_token("fake-token")
    cred.save()
    task = Task.objects.create(
        summary="Synced title",
        description="Desc",
        type="execution",
        project=project,
        owner=user,
        linear_issue_id="linear-issue-uuid-1",
    )
    api_client.force_authenticate(user=user)
    with patch("linear_integration.services.issue_update") as upd:
        r = api_client.post(PUSH_URL, {"task_id": task.id}, format="json")
    assert r.status_code == status.HTTP_200_OK
    assert r.data["action"] == "updated"
    assert r.data["linear_issue_id"] == "linear-issue-uuid-1"
    upd.assert_called_once()


@pytest.mark.django_db
def test_push_task_creates_with_team(organization, api_client):
    user = User.objects.create_user(
        username="linpush3",
        email="linpush3@test.com",
        password="x",
        organization=organization,
    )
    project = Project.objects.create(
        name="P3",
        organization=organization,
        owner=user,
        objectives=["awareness"],
        kpis={"ctr": {"target": 0.02}},
    )
    ProjectMember.objects.create(user=user, project=project, role="Team Leader", is_active=True)
    cred = LinearCredential(user=user)
    cred.set_access_token("fake-token")
    cred.save()
    task = Task.objects.create(
        summary="New in Linear",
        description="Body",
        type="execution",
        project=project,
        owner=user,
    )
    api_client.force_authenticate(user=user)
    with patch("linear_integration.services.issue_create", return_value="new-linear-id") as cr:
        r = api_client.post(
            PUSH_URL,
            {"task_id": task.id, "team_id": "team-uuid-9"},
            format="json",
        )
    assert r.status_code == status.HTTP_200_OK
    assert r.data["action"] == "created"
    assert r.data["linear_issue_id"] == "new-linear-id"
    cr.assert_called_once()
    assert Task.objects.get(pk=task.pk).linear_issue_id == "new-linear-id"


@pytest.mark.django_db
def test_push_task_forbidden_non_member(organization, api_client):
    owner = User.objects.create_user(
        username="owner1",
        email="owner1@test.com",
        password="x",
        organization=organization,
    )
    outsider = User.objects.create_user(
        username="out1",
        email="out1@test.com",
        password="x",
        organization=organization,
    )
    project = Project.objects.create(
        name="P4",
        organization=organization,
        owner=owner,
        objectives=["awareness"],
        kpis={"ctr": {"target": 0.02}},
    )
    ProjectMember.objects.create(user=owner, project=project, role="Team Leader", is_active=True)
    task = Task.objects.create(
        summary="Private",
        type="execution",
        project=project,
        owner=owner,
    )
    api_client.force_authenticate(user=outsider)
    r = api_client.post(PUSH_URL, {"task_id": task.id, "team_id": "t"}, format="json")
    assert r.status_code == status.HTTP_403_FORBIDDEN
