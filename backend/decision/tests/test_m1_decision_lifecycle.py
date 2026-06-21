import pytest
from rest_framework.test import APIClient

from core.models import Organization, Project, ProjectMember
from decision.models import Decision, DecisionStateTransition, Review
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


def _make_commit_ready_payload():
    return {
        "contextSummary": "Context summary for commit",
        "reasoning": "Reasoning for commit",
        "riskLevel": "LOW",
        "confidenceScore": 4,
        "signals": [
            {
                "metric": "ROAS",
                "movement": "SHARP_DECREASE",
                "period": "LAST_7_DAYS",
                "comparison": "PREVIOUS_PERIOD",
            }
        ],
        "options": [
            {
                "text": "Option A",
                "isSelected": True,
                "order": 1,
            },
            {
                "text": "Option B",
                "isSelected": False,
                "order": 2,
            },
        ],
    }


@pytest.mark.django_db
def test_commit_requires_only_title():
    user, project = _create_user_with_project()
    client = _client_for(user, project)

    create_resp = client.post("/api/decisions/drafts/", {"title": "Title only"}, format="json")
    assert create_resp.status_code == 201
    decision_id = create_resp.data["id"]
    decision_slug = create_resp.data["slug"]

    commit_resp = client.post(f"/api/decisions/{decision_slug}/commit/", {}, format="json")
    assert commit_resp.status_code == 200
    decision = Decision.objects.get(pk=decision_id)
    assert decision.status == Decision.Status.COMMITTED


@pytest.mark.django_db
def test_commit_rejects_missing_title():
    user, project = _create_user_with_project()
    client = _client_for(user, project)

    create_resp = client.post("/api/decisions/drafts/", {"title": "Temporary"}, format="json")
    assert create_resp.status_code == 201
    decision_id = create_resp.data["id"]
    decision_slug = create_resp.data["slug"]
    Decision.objects.filter(pk=decision_id).update(title="")

    commit_resp = client.post(f"/api/decisions/{decision_slug}/commit/", {}, format="json")
    assert commit_resp.status_code == 400
    field_errors = commit_resp.data["error"]["details"]["fieldErrors"]
    assert field_errors == [{"field": "title", "message": "Title is required before commit."}]


@pytest.mark.django_db
def test_commit_review_archive_happy_path():
    """Assert draft -> commit -> review lifecycle succeeds with correct statuses and transitions."""
    user, project = _create_user_with_project()
    client = _client_for(user, project)

    create_resp = client.post("/api/decisions/drafts/", {"title": "Test Decision"}, format="json")
    assert create_resp.status_code == 201
    created = Decision.objects.get(title="Test Decision")
    decision_id = created.id
    decision_slug = created.slug

    patch_resp = client.patch(
        f"/api/decisions/drafts/{decision_slug}/",
        _make_commit_ready_payload(),
        format="json",
    )
    assert patch_resp.status_code == 200

    commit_resp = client.post(f"/api/decisions/{decision_slug}/commit/", {}, format="json")
    assert commit_resp.status_code == 200
    decision = Decision.objects.get(pk=decision_id)
    assert decision.status == Decision.Status.COMMITTED

    commit_transitions = DecisionStateTransition.objects.filter(
        decision=decision,
        transition_method="commit",
    )
    assert commit_transitions.count() == 1
    transition = commit_transitions.first()
    assert transition.from_status == Decision.Status.DRAFT
    assert transition.to_status == Decision.Status.COMMITTED

    review_payload = {
        "outcomeText": "Outcome summary",
        "reflectionText": "Reflection summary",
        "decisionQuality": "GOOD",
    }
    review_resp = client.post(
        f"/api/decisions/{decision_slug}/reviews/",
        review_payload,
        format="json",
    )
    assert review_resp.status_code == 201
    decision = Decision.objects.get(pk=decision_id)
    assert decision.status == Decision.Status.REVIEWED

    assert Review.objects.filter(decision=decision).count() == 1
    review_transitions = DecisionStateTransition.objects.filter(
        decision=decision,
        transition_method="review",
    )
    assert review_transitions.count() == 1
    review_transition = review_transitions.first()
    assert review_transition.from_status == Decision.Status.COMMITTED
    assert review_transition.to_status == Decision.Status.REVIEWED

    second_review_resp = client.post(
        f"/api/decisions/{decision_slug}/reviews/",
        {
            "outcomeText": "Second outcome",
            "reflectionText": "Second reflection",
            "decisionQuality": "ACCEPTABLE",
        },
        format="json",
    )
    assert second_review_resp.status_code == 201
    decision = Decision.objects.get(pk=decision_id)
    assert decision.status == Decision.Status.REVIEWED
    assert Review.objects.filter(decision=decision).count() == 2
    assert DecisionStateTransition.objects.filter(
        decision=decision,
        transition_method="review",
    ).count() == 1


@pytest.mark.django_db
def test_patch_committed_decision_content():
    user, project = _create_user_with_project()
    client = _client_for(user, project)

    create_resp = client.post("/api/decisions/drafts/", {"title": "Original"}, format="json")
    assert create_resp.status_code == 201
    decision_id = create_resp.data["id"]
    decision_slug = create_resp.data["slug"]

    client.patch(
        f"/api/decisions/drafts/{decision_slug}/",
        _make_commit_ready_payload(),
        format="json",
    )
    commit_resp = client.post(f"/api/decisions/{decision_slug}/commit/", {}, format="json")
    assert commit_resp.status_code == 200

    amend_resp = client.patch(
        f"/api/decisions/{decision_slug}/",
        {"title": "Amended title", "contextSummary": "Updated context"},
        format="json",
    )
    assert amend_resp.status_code == 200
    assert amend_resp.data["title"] == "Amended title"
    assert amend_resp.data["contextSummary"] == "Updated context"

    decision = Decision.objects.get(pk=decision_id)
    assert decision.status == Decision.Status.COMMITTED
    assert decision.title == "Amended title"
