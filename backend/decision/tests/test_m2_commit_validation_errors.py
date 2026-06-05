import pytest
from rest_framework.test import APIClient

from core.models import Organization, Project, ProjectMember
from decision.models import CommitRecord, Decision, DecisionStateTransition
from django.contrib.auth import get_user_model


User = get_user_model()


def _create_user_with_project():
    organization = Organization.objects.create(
        name="Test Org",
        email_domain="test.com",
    )
    user = User.objects.create_user(
        email="user@test.com",
        username="testuser",
        password="password123",
        organization=organization,
        is_verified=True,
        is_active=True,
        password_set=True,
    )
    project = Project.objects.create(
        name="Test Project",
        organization=organization,
        owner=user,
        objectives=["awareness"],
        kpis={"ctr": {"target": 0.02}},
    )
    ProjectMember.objects.create(
        user=user,
        project=project,
        role="member",
        is_active=True,
    )
    return user, project


def _client_for(user, project):
    client = APIClient()
    client.force_authenticate(user=user)
    client.credentials(HTTP_X_PROJECT_ID=str(project.id))
    return client


def _assert_has_error_details(response_data):
    if isinstance(response_data, dict):
        if "error" in response_data:
            return
        if "detail" in response_data:
            return
        if "fieldErrors" in response_data:
            return
        if "details" in response_data:
            return
    raise AssertionError("Expected validation error details in response payload.")


@pytest.mark.django_db
@pytest.mark.parametrize("title_value", ["", "   "])
def test_commit_rejects_blank_title_without_side_effects(title_value):
    """Commit only requires a non-empty title; blank titles return 400 with no side effects."""
    user, project = _create_user_with_project()
    client = _client_for(user, project)

    create_resp = client.post("/api/decisions/drafts/", {"title": "Has title"}, format="json")
    assert create_resp.status_code == 201
    decision_id = create_resp.data["id"]
    Decision.objects.filter(pk=decision_id).update(title=title_value)

    commit_resp = client.post(f"/api/decisions/{decision_id}/commit/", {}, format="json")
    assert commit_resp.status_code == 400
    _assert_has_error_details(commit_resp.data)

    decision = Decision.objects.get(pk=decision_id)
    assert decision.status == Decision.Status.DRAFT
    assert CommitRecord.objects.filter(decision=decision).count() == 0
    assert DecisionStateTransition.objects.filter(decision=decision).count() == 0


@pytest.mark.django_db
def test_commit_succeeds_with_title_only_without_optional_fields():
    """Optional draft fields are not required at commit time (SMP-554)."""
    user, project = _create_user_with_project()
    client = _client_for(user, project)

    create_resp = client.post("/api/decisions/drafts/", {"title": "Title only"}, format="json")
    assert create_resp.status_code == 201
    decision_id = create_resp.data["id"]

    commit_resp = client.post(f"/api/decisions/{decision_id}/commit/", {}, format="json")
    assert commit_resp.status_code == 200

    decision = Decision.objects.get(pk=decision_id)
    assert decision.status == Decision.Status.COMMITTED
    assert CommitRecord.objects.filter(decision=decision).count() == 1
