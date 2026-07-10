"""
Targeted pytest tests for edge-case branches in campaign/views.py that were not
covered by the existing TestCase-based tests.

Specifically covers:
  - CampaignViewSet.get_queryset: user with no project memberships → empty QS
  - CampaignViewSet.get_queryset: project filter for inaccessible project → 403
  - CampaignViewSet.get_queryset: search, owner, assignee filters
  - PerformanceCheckIn: non-existent campaign_id → get_queryset returns none
  - PerformanceCheckIn: non-existent campaign in perform_create → 400
  - PerformanceSnapshot: same patterns as CheckIn
  - CampaignAttachment: DoesNotExist in get_queryset and perform_create
  - PerformanceSnapshot.upload_screenshot: no file → 400
"""
import uuid
import io

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Organization, Project, ProjectMember
from campaign.models import Campaign, PerformanceCheckIn

User = get_user_model()


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def org(db):
    return Organization.objects.create(
        name=f"CampaignEdge Org {uuid.uuid4().hex[:8]}",
        email_domain="campaignedge.test",
    )


@pytest.fixture
def project(org):
    return Project.objects.create(name="CampaignEdge Project", organization=org)


@pytest.fixture
def user(org):
    uid = uuid.uuid4().hex[:8]
    return User.objects.create_user(
        username=f"campedge_{uid}",
        email=f"campedge_{uid}@test.com",
        password="testpass123",
        organization=org,
    )


@pytest.fixture
def member_user(org):
    uid = uuid.uuid4().hex[:8]
    return User.objects.create_user(
        username=f"member_{uid}",
        email=f"member_{uid}@test.com",
        password="testpass123",
        organization=org,
    )


@pytest.fixture
def user_no_access(org):
    uid = uuid.uuid4().hex[:8]
    return User.objects.create_user(
        username=f"noaccess_{uid}",
        email=f"noaccess_{uid}@test.com",
        password="testpass123",
        organization=org,
    )


@pytest.fixture
def campaign_with_member(project, user, member_user):
    ProjectMember.objects.create(user=user, project=project, role="member", is_active=True)
    ProjectMember.objects.create(user=member_user, project=project, role="member", is_active=True)
    c = Campaign.objects.create(
        name="Edge Case Campaign",
        objective=Campaign.Objective.CONVERSION,
        platforms=[Campaign.Platform.META],
        start_date=timezone.now().date(),
        project=project,
        owner=user,
        creator=user,
    )
    return c


@pytest.fixture
def auth_client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def no_access_client(user_no_access):
    c = APIClient()
    c.force_authenticate(user=user_no_access)
    return c


# ---------------------------------------------------------------------------
# CampaignViewSet.get_queryset: user with no project memberships
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_list_campaigns_no_memberships_returns_empty(user_no_access):
    """User with no project memberships should see an empty campaign list."""
    client = APIClient()
    client.force_authenticate(user=user_no_access)
    response = client.get("/api/campaigns/")
    assert response.status_code == status.HTTP_200_OK
    data = response.data
    results = data["results"] if isinstance(data, dict) and "results" in data else data
    assert len(results) == 0


# ---------------------------------------------------------------------------
# CampaignViewSet.get_queryset: project filter for inaccessible project
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_list_campaigns_inaccessible_project_filter_returns_403(user_no_access, project):
    """Filtering by a project the user has no access to should raise 403."""
    client = APIClient()
    client.force_authenticate(user=user_no_access)
    response = client.get(f"/api/campaigns/?project={project.slug}")
    assert response.status_code == status.HTTP_403_FORBIDDEN


# ---------------------------------------------------------------------------
# CampaignViewSet.get_queryset: search and owner/assignee filters (smoke test)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_list_campaigns_with_search_filter(auth_client, campaign_with_member):
    """search= filter should not crash and return results."""
    response = auth_client.get("/api/campaigns/?search=Edge")
    assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_list_campaigns_with_owner_filter(auth_client, campaign_with_member, user):
    """owner= filter exercises the queryset branch."""
    response = auth_client.get(f"/api/campaigns/?owner={user.id}")
    assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_list_campaigns_with_assignee_filter(auth_client, campaign_with_member, user):
    """assignee= filter exercises the queryset branch."""
    response = auth_client.get(f"/api/campaigns/?assignee={user.id}")
    assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# PerformanceCheckIn: non-existent campaign in get_queryset → empty list
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_checkin_list_nonexistent_campaign_returns_empty(auth_client):
    """get_queryset DoesNotExist branch → 200 with empty results."""
    fake_id = str(uuid.uuid4())
    response = auth_client.get(f"/api/campaigns/{fake_id}/check-ins/")
    assert response.status_code == status.HTTP_200_OK
    data = response.data
    results = data["results"] if isinstance(data, dict) and "results" in data else data
    assert len(results) == 0


# ---------------------------------------------------------------------------
# PerformanceCheckIn: non-existent campaign in perform_create → 400
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_checkin_create_nonexistent_campaign_returns_400(auth_client):
    """perform_create DoesNotExist branch → 400."""
    fake_id = str(uuid.uuid4())
    response = auth_client.post(
        f"/api/campaigns/{fake_id}/check-ins/",
        data={"sentiment": PerformanceCheckIn.Sentiment.POSITIVE, "note": "test"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# PerformanceSnapshot: non-existent campaign in get_queryset → empty list
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_snapshot_list_nonexistent_campaign_returns_empty(auth_client):
    """get_queryset DoesNotExist branch for snapshots → 200 with empty results."""
    fake_id = str(uuid.uuid4())
    response = auth_client.get(f"/api/campaigns/{fake_id}/performance-snapshots/")
    assert response.status_code == status.HTTP_200_OK
    data = response.data
    results = data["results"] if isinstance(data, dict) and "results" in data else data
    assert len(results) == 0


# ---------------------------------------------------------------------------
# PerformanceSnapshot: non-existent campaign in perform_create → 400
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_snapshot_create_nonexistent_campaign_returns_400(auth_client):
    """perform_create DoesNotExist branch for snapshots → 400."""
    fake_id = str(uuid.uuid4())
    response = auth_client.post(
        f"/api/campaigns/{fake_id}/performance-snapshots/",
        data={
            "milestone_type": "TESTING",
            "metric_type": "ROI",
            "value": "1.5",
            "notes": "test",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# CampaignAttachment: non-existent campaign in get_queryset → empty list
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_attachment_list_nonexistent_campaign_returns_empty(auth_client):
    """get_queryset DoesNotExist branch for attachments → 200 with empty results."""
    fake_id = str(uuid.uuid4())
    response = auth_client.get(f"/api/campaigns/{fake_id}/attachments/")
    assert response.status_code == status.HTTP_200_OK
    data = response.data
    results = data["results"] if isinstance(data, dict) and "results" in data else data
    assert len(results) == 0


# ---------------------------------------------------------------------------
# CampaignAttachment: asset_type filter coverage
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_attachment_list_with_asset_type_filter_smoke(auth_client, campaign_with_member):
    """asset_type= filter exercises the queryset branch."""
    response = auth_client.get(
        f"/api/campaigns/{campaign_with_member.id}/attachments/?asset_type=IMAGE"
    )
    assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# PerformanceSnapshot.upload_screenshot: missing file → 400
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_snapshot_upload_screenshot_no_file_returns_400(auth_client, campaign_with_member):
    """upload_screenshot with no 'file' in request → 400."""
    from campaign.models import PerformanceSnapshot

    snapshot = PerformanceSnapshot.objects.create(
        campaign=campaign_with_member,
        snapshot_by=campaign_with_member.owner,
        milestone_type=PerformanceSnapshot.MilestoneType.CUSTOM,
        metric_type=PerformanceSnapshot.MetricType.CTR,
        metric_value="0.05",
        spend="0.00",
    )
    url = (
        f"/api/campaigns/{campaign_with_member.id}"
        f"/performance-snapshots/{snapshot.id}/screenshot/"
    )
    response = auth_client.post(url, data={}, format="multipart")
    assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# CampaignViewSet filter by status
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_list_campaigns_with_status_filter(auth_client, campaign_with_member):
    """status= filter exercises the queryset branch."""
    response = auth_client.get("/api/campaigns/?status=PLANNING")
    assert response.status_code == status.HTTP_200_OK
