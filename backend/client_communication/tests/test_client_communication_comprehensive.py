"""
Comprehensive tests for client_communication views, models, and serializers.
Supplements the basic tests in test_client_communication_api.py with edge
cases, error paths, and the detail (retrieve/update) view.
"""

from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Organization, Project, ProjectMember
from task.models import Task
from client_communication.models import ClientCommunication, CommunicationType, ImpactedArea
from client_communication.serializers import (
    ClientCommunicationSerializer,
    ClientCommunicationCreateSerializer,
)

User = get_user_model()


@pytest.fixture
def organization(db):
    import uuid
    return Organization.objects.create(
        name=f"CC Test Org {uuid.uuid4().hex[:8]}",
        email_domain="cc.test",
    )


@pytest.fixture
def user(organization, db):
    import uuid
    return User.objects.create_user(
        username=f"ccuser_{uuid.uuid4().hex[:6]}",
        email=f"ccuser_{uuid.uuid4().hex[:6]}@cc.test",
        password="pass123",
        organization=organization,
    )


@pytest.fixture
def project(organization, user, db):
    p = Project.objects.create(
        name="CC Test Project",
        organization=organization,
        owner=user,
    )
    ProjectMember.objects.create(user=user, project=p, role="member", is_active=True)
    return p


@pytest.fixture
def task(project, user, db):
    return Task.objects.create(
        summary="CC Task",
        type="communication",
        project=project,
        owner=user,
    )


@pytest.fixture
def comm(task, db):
    return ClientCommunication.objects.create(
        task=task,
        communication_type=CommunicationType.BUDGET_CHANGE,
        stakeholders="Client: Alice",
        impacted_areas=[ImpactedArea.BUDGET],
        required_actions="Increase budget by 10%.",
    )


@pytest.fixture
def api_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


# ---------------------------------------------------------------------------
# Detail view – retrieve
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestClientCommunicationDetailRetrieve:
    def test_retrieve_returns_200(self, api_client, comm):
        url = reverse("client_communication:client-communication-detail", kwargs={"pk": comm.pk})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == comm.pk
        assert response.data["communication_type"] == CommunicationType.BUDGET_CHANGE

    def test_retrieve_includes_all_fields(self, api_client, comm):
        url = reverse("client_communication:client-communication-detail", kwargs={"pk": comm.pk})
        response = api_client.get(url)
        data = response.data
        for field in ["id", "task", "communication_type", "stakeholders", "impacted_areas",
                      "required_actions", "client_deadline", "notes", "created_at", "updated_at"]:
            assert field in data, f"Missing field: {field}"

    def test_retrieve_nonexistent_returns_404(self, api_client):
        url = reverse("client_communication:client-communication-detail", kwargs={"pk": 99999})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_retrieve_unauthenticated_returns_401(self, comm):
        unauth_client = APIClient()
        url = reverse("client_communication:client-communication-detail", kwargs={"pk": comm.pk})
        response = unauth_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# Detail view – update
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestClientCommunicationDetailUpdate:
    def test_partial_update_communication_type(self, api_client, comm):
        url = reverse("client_communication:client-communication-detail", kwargs={"pk": comm.pk})
        response = api_client.patch(
            url,
            {"communication_type": CommunicationType.KPI_UPDATE},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        comm.refresh_from_db()
        assert comm.communication_type == CommunicationType.KPI_UPDATE

    def test_partial_update_impacted_areas(self, api_client, comm):
        url = reverse("client_communication:client-communication-detail", kwargs={"pk": comm.pk})
        response = api_client.patch(
            url,
            {"impacted_areas": [ImpactedArea.CREATIVE, ImpactedArea.KPI]},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        comm.refresh_from_db()
        assert set(comm.impacted_areas) == {ImpactedArea.CREATIVE, ImpactedArea.KPI}

    def test_partial_update_notes(self, api_client, comm):
        url = reverse("client_communication:client-communication-detail", kwargs={"pk": comm.pk})
        response = api_client.patch(url, {"notes": "Updated notes."}, format="json")
        assert response.status_code == status.HTTP_200_OK
        comm.refresh_from_db()
        assert comm.notes == "Updated notes."

    def test_partial_update_invalid_type_returns_400(self, api_client, comm):
        url = reverse("client_communication:client-communication-detail", kwargs={"pk": comm.pk})
        response = api_client.patch(
            url,
            {"communication_type": "invalid_type"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_partial_update_invalid_impacted_area_returns_400(self, api_client, comm):
        url = reverse("client_communication:client-communication-detail", kwargs={"pk": comm.pk})
        response = api_client.patch(
            url,
            {"impacted_areas": ["not_a_real_area"]},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_full_put_update(self, api_client, comm):
        url = reverse("client_communication:client-communication-detail", kwargs={"pk": comm.pk})
        payload = {
            "task": comm.task.pk,
            "communication_type": CommunicationType.CREATIVE_APPROVAL,
            "stakeholders": "Client: Bob",
            "impacted_areas": [ImpactedArea.CREATIVE],
            "required_actions": "Approve creative V3.",
            "client_deadline": "2030-06-01",
            "notes": "Full update test.",
        }
        response = api_client.put(url, payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        comm.refresh_from_db()
        assert comm.communication_type == CommunicationType.CREATIVE_APPROVAL

    def test_update_unauthenticated_returns_401(self, comm):
        unauth_client = APIClient()
        url = reverse("client_communication:client-communication-detail", kwargs={"pk": comm.pk})
        response = unauth_client.patch(url, {"notes": "x"}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# List view – additional coverage
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestClientCommunicationListAdditional:
    def test_list_without_task_id_returns_all(self, api_client, comm, task, db):
        # Create a second comm on a different task
        task2 = Task.objects.create(
            summary="Task 2",
            type="communication",
            project=task.project,
            owner=task.owner,
        )
        ClientCommunication.objects.create(
            task=task2,
            communication_type=CommunicationType.OTHER,
            impacted_areas=[ImpactedArea.TARGETING],
            required_actions="Action 2",
        )
        url = reverse("client_communication:client-communication-list-create")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        items = response.data.get("results", response.data)
        assert len(items) >= 2

    def test_list_unauthenticated_returns_401(self, comm):
        unauth_client = APIClient()
        url = reverse("client_communication:client-communication-list-create")
        response = unauth_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_filtered_by_task_id_excludes_others(self, api_client, task, comm, db):
        task2 = Task.objects.create(
            summary="Task 2",
            type="communication",
            project=task.project,
            owner=task.owner,
        )
        ClientCommunication.objects.create(
            task=task2,
            communication_type=CommunicationType.OTHER,
            impacted_areas=[ImpactedArea.TARGETING],
            required_actions="Other task comm",
        )
        url = reverse("client_communication:client-communication-list-create")
        response = api_client.get(url, {"task_id": task.pk})
        assert response.status_code == status.HTTP_200_OK
        items = response.data.get("results", response.data)
        assert all(item["task"] == task.pk for item in items)

    def test_list_nonexistent_task_id_returns_empty(self, api_client):
        url = reverse("client_communication:client-communication-list-create")
        response = api_client.get(url, {"task_id": 99999})
        assert response.status_code == status.HTTP_200_OK
        items = response.data.get("results", response.data)
        assert len(items) == 0


# ---------------------------------------------------------------------------
# Create – error paths
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestClientCommunicationCreateErrors:
    def test_create_unauthenticated_returns_401(self, task):
        unauth_client = APIClient()
        url = reverse("client_communication:client-communication-list-create")
        response = unauth_client.post(
            url,
            {
                "task": task.pk,
                "communication_type": "budget_change",
                "impacted_areas": ["budget"],
                "required_actions": "test",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_nonexistent_task_returns_404(self, api_client):
        url = reverse("client_communication:client-communication-list-create")
        response = api_client.post(
            url,
            {
                "task": 99999,
                "communication_type": "budget_change",
                "impacted_areas": ["budget"],
                "required_actions": "test",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_invalid_communication_type_returns_400(self, api_client, task):
        url = reverse("client_communication:client-communication-list-create")
        response = api_client.post(
            url,
            {
                "task": task.pk,
                "communication_type": "unknown_type",
                "impacted_areas": ["budget"],
                "required_actions": "test",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_missing_required_fields_returns_400(self, api_client, task):
        url = reverse("client_communication:client-communication-list-create")
        response = api_client.post(url, {"task": task.pk}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_empty_impacted_areas_returns_400(self, api_client, task):
        url = reverse("client_communication:client-communication-list-create")
        response = api_client.post(
            url,
            {
                "task": task.pk,
                "communication_type": "budget_change",
                "impacted_areas": [],
                "required_actions": "test",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# Model tests – __str__ and clean()
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestClientCommunicationModel:
    def test_str_representation(self, comm):
        expected = f"ClientCommunication #{comm.id} for Task {comm.task_id}"
        assert str(comm) == expected

    def test_clean_empty_impacted_areas_raises(self, task, db):
        comm = ClientCommunication(
            task=task,
            communication_type=CommunicationType.BUDGET_CHANGE,
            impacted_areas=[],
            required_actions="test",
        )
        with pytest.raises(ValidationError) as exc_info:
            comm.clean()
        assert "impacted_areas" in str(exc_info.value)

    def test_clean_invalid_impacted_area_value_raises(self, task, db):
        comm = ClientCommunication(
            task=task,
            communication_type=CommunicationType.BUDGET_CHANGE,
            impacted_areas=["not_valid_area"],
            required_actions="test",
        )
        with pytest.raises(ValidationError) as exc_info:
            comm.clean()
        assert "impacted_areas" in str(exc_info.value)

    def test_clean_deadline_more_than_365_days_ago_raises(self, task, db):
        old_date = date.today() - timedelta(days=400)
        comm = ClientCommunication(
            task=task,
            communication_type=CommunicationType.BUDGET_CHANGE,
            impacted_areas=[ImpactedArea.BUDGET],
            required_actions="test",
            client_deadline=old_date,
        )
        with pytest.raises(ValidationError) as exc_info:
            comm.clean()
        assert "client_deadline" in str(exc_info.value)

    def test_clean_deadline_within_365_days_does_not_raise(self, task, db):
        """A deadline 364 days ago is allowed (edge case)."""
        recent_past = date.today() - timedelta(days=364)
        comm = ClientCommunication(
            task=task,
            communication_type=CommunicationType.BUDGET_CHANGE,
            impacted_areas=[ImpactedArea.BUDGET],
            required_actions="test",
            client_deadline=recent_past,
        )
        # Should NOT raise
        comm.clean()

    def test_clean_future_deadline_does_not_raise(self, task, db):
        future_date = date.today() + timedelta(days=30)
        comm = ClientCommunication(
            task=task,
            communication_type=CommunicationType.BUDGET_CHANGE,
            impacted_areas=[ImpactedArea.BUDGET],
            required_actions="test",
            client_deadline=future_date,
        )
        comm.clean()

    def test_clean_no_deadline_does_not_raise(self, task, db):
        comm = ClientCommunication(
            task=task,
            communication_type=CommunicationType.BUDGET_CHANGE,
            impacted_areas=[ImpactedArea.BUDGET],
            required_actions="test",
        )
        comm.clean()

    def test_clean_multiple_valid_impacted_areas(self, task, db):
        comm = ClientCommunication(
            task=task,
            communication_type=CommunicationType.KPI_UPDATE,
            impacted_areas=[ImpactedArea.BUDGET, ImpactedArea.CREATIVE, ImpactedArea.KPI],
            required_actions="test",
        )
        comm.clean()  # Should not raise

    def test_all_communication_types_accepted(self, task, db):
        for comm_type in CommunicationType:
            obj = ClientCommunication(
                task=task,
                communication_type=comm_type,
                impacted_areas=[ImpactedArea.BUDGET],
                required_actions="test",
            )
            obj.clean()


# ---------------------------------------------------------------------------
# Serializer unit tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestClientCommunicationSerializer:
    def test_serializer_valid_data(self, comm):
        serializer = ClientCommunicationSerializer(comm)
        data = serializer.data
        assert data["id"] == comm.pk
        assert data["communication_type"] == comm.communication_type
        assert data["task"] == comm.task.pk

    def test_create_serializer_task_is_write_only(self, comm):
        """In the create serializer, 'task' is write-only (not in response)."""
        serializer = ClientCommunicationCreateSerializer(comm)
        # write_only fields are NOT included in serializer.data
        assert "task" not in serializer.data

    def test_serializer_empty_impacted_areas_invalid(self, comm):
        serializer = ClientCommunicationSerializer(
            comm,
            data={
                "communication_type": "budget_change",
                "impacted_areas": [],
                "required_actions": "test",
                "task": comm.task.pk,
            },
        )
        assert not serializer.is_valid()
        assert "impacted_areas" in serializer.errors

    def test_serializer_invalid_impacted_area_choice(self, comm):
        serializer = ClientCommunicationSerializer(
            comm,
            data={
                "communication_type": "budget_change",
                "impacted_areas": ["not_real"],
                "required_actions": "test",
                "task": comm.task.pk,
            },
        )
        assert not serializer.is_valid()
        assert "impacted_areas" in serializer.errors
