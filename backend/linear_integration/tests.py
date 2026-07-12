"""
Tests for linear_integration views.
Covers: linear_integration/views.py, models.py, serializers.py, services.py
"""
import uuid
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.core import signing
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Organization, Project, ProjectMember
from linear_integration.linear_graphql import LinearGraphQLError
from linear_integration.models import LinearCredential
from linear_integration.services import LinearTokenExchangeError
from task.models import Task

User = get_user_model()

LINEAR_OAUTH_STATE_SALT = "linear-oauth-state"
CONNECT_URL = "/api/v1/linear/connect/"
CALLBACK_URL = "/api/v1/linear/callback/"
STATUS_URL = "/api/v1/linear/status/"
DISCONNECT_URL = "/api/v1/linear/disconnect/"
TEAMS_URL = "/api/v1/linear/teams/"
ISSUES_URL = "/api/v1/linear/issues/"
IMPORT_URL = "/api/v1/linear/import-issues/"
PUSH_URL = "/api/v1/linear/push-task/"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def organization(db):
    return Organization.objects.create(
        name=f"Linear Test Org {uuid.uuid4().hex[:6]}",
        slug=f"linear-{uuid.uuid4().hex[:6]}",
    )


@pytest.fixture
def user(organization, db):
    return User.objects.create_user(
        username=f"linuser_{uuid.uuid4().hex[:6]}",
        email=f"linuser_{uuid.uuid4().hex[:6]}@test.com",
        password="pass123",
        organization=organization,
    )


@pytest.fixture
def project(organization, user, db):
    p = Project.objects.create(
        name="Linear Test Project",
        organization=organization,
        owner=user,
    )
    ProjectMember.objects.create(user=user, project=p, role="member", is_active=True)
    return p


@pytest.fixture
def task(project, user, db):
    return Task.objects.create(
        summary="Linear Test Task",
        type="execution",
        project=project,
        owner=user,
    )


@pytest.fixture
def credential(user, db):
    """Active LinearCredential for user with a fake access token."""
    cred = LinearCredential(user=user)
    cred.set_access_token("fake_linear_access_token_abc123")
    cred.save()
    return cred


@pytest.fixture
def api_client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def unauth_client():
    return APIClient()


def _build_state(user_id: int, code_verifier: str = "test_cv_abcdefghijklmnopqrstuvwxyz1234") -> str:
    """Build a valid OAuth state payload with the required 'cv' field."""
    return signing.dumps(
        {"user_id": user_id, "nonce": "testnonce12345678", "cv": code_verifier},
        salt=LINEAR_OAUTH_STATE_SALT,
    )


# ---------------------------------------------------------------------------
# LinearConnectView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLinearConnectView:
    def test_missing_env_returns_503(self, api_client):
        """Without LINEAR_CLIENT_ID/SECRET/REDIRECT_URI configured → 503."""
        response = api_client.get(CONNECT_URL)
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "missing_env" in response.data

    @override_settings(
        LINEAR_CLIENT_ID="test_client_id",
        LINEAR_CLIENT_SECRET="test_secret",
        LINEAR_REDIRECT_URI="http://localhost/api/v1/linear/callback/",
    )
    def test_with_oauth_settings_returns_auth_url(self, api_client):
        """With valid env vars, returns 200 with auth_url."""
        with patch(
            "linear_integration.views.build_authorization_url",
            return_value="https://linear.app/oauth/authorize?client_id=test_client_id",
        ):
            response = api_client.get(CONNECT_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "auth_url" in response.data
        assert "linear.app" in response.data["auth_url"]

    @override_settings(
        LINEAR_CLIENT_ID="test_client_id",
        LINEAR_CLIENT_SECRET="test_secret",
        LINEAR_REDIRECT_URI="http://localhost/api/v1/linear/callback/",
    )
    def test_build_authorization_url_exception_returns_503(self, api_client):
        """If build_authorization_url raises, returns 503."""
        with patch(
            "linear_integration.views.build_authorization_url",
            side_effect=Exception("misconfigured"),
        ):
            response = api_client.get(CONNECT_URL)
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    def test_unauthenticated_returns_401(self, unauth_client):
        response = unauth_client.get(CONNECT_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# LinearCallbackView (AllowAny)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLinearCallbackView:
    def test_no_code_no_state_redirects_oauth_incomplete(self, unauth_client):
        response = unauth_client.get(CALLBACK_URL)
        assert response.status_code == 302
        assert "linear_error=oauth_incomplete" in response["Location"]

    def test_no_state_with_code_redirects_invalid_state(self, unauth_client):
        response = unauth_client.get(CALLBACK_URL, {"code": "mycode"})
        assert response.status_code == 302
        assert "linear_error=invalid_state" in response["Location"]

    def test_invalid_state_signature_redirects_invalid_state(self, unauth_client):
        response = unauth_client.get(
            CALLBACK_URL, {"code": "mycode", "state": "tampered_state_value"}
        )
        assert response.status_code == 302
        assert "linear_error=invalid_state" in response["Location"]

    def test_expired_state_redirects_state_expired(self, unauth_client, user):
        state = _build_state(user.id)
        with patch("linear_integration.views.signing.loads") as mock_loads:
            mock_loads.side_effect = signing.SignatureExpired("expired")
            response = unauth_client.get(CALLBACK_URL, {"code": "code123", "state": state})
        assert response.status_code == 302
        assert "linear_error=state_expired" in response["Location"]

    def test_state_without_cv_redirects_invalid_state(self, unauth_client, user):
        """State missing 'cv' key is invalid."""
        state = signing.dumps(
            {"user_id": user.id, "nonce": "abc"},  # no 'cv'
            salt=LINEAR_OAUTH_STATE_SALT,
        )
        response = unauth_client.get(CALLBACK_URL, {"code": "code123", "state": state})
        assert response.status_code == 302
        assert "linear_error=invalid_state" in response["Location"]

    def test_no_code_in_state_valid_redirects_access_denied(self, unauth_client, user):
        """Valid state but no ?code= → redirects with error from ?error= param or 'access_denied'."""
        state = _build_state(user.id)
        response = unauth_client.get(CALLBACK_URL, {"state": state})
        assert response.status_code == 302
        assert "linear_error=access_denied" in response["Location"]

    def test_no_code_with_error_param_uses_error_param(self, unauth_client, user):
        """When no code but ?error= present in query, redirect uses that error."""
        state = _build_state(user.id)
        response = unauth_client.get(
            CALLBACK_URL, {"state": state, "error": "access_denied_by_user"}
        )
        assert response.status_code == 302
        assert "linear_error=access_denied_by_user" in response["Location"]

    def test_token_exchange_error_redirects_token_exchange_failed(self, unauth_client, user):
        state = _build_state(user.id)
        with patch("linear_integration.views.exchange_code_for_token") as mock_exc:
            mock_exc.side_effect = LinearTokenExchangeError("Bad client credentials", 401)
            response = unauth_client.get(
                CALLBACK_URL, {"code": "code123", "state": state}
            )
        assert response.status_code == 302
        assert "linear_error=token_exchange_failed" in response["Location"]

    def test_user_not_found_redirects_user_not_found(self, unauth_client):
        """State contains a user_id that doesn't exist in the DB."""
        state = _build_state(user_id=999999)
        response = unauth_client.get(CALLBACK_URL, {"code": "code123", "state": state})
        assert response.status_code == 302
        assert "linear_error=user_not_found" in response["Location"]

    def test_successful_callback_redirects_to_linear(self, unauth_client, user):
        """Successful token exchange redirects to LINEAR_APP_AFTER_LOGIN."""
        state = _build_state(user.id)
        token_data = {"access_token": "real_linear_token"}
        with patch("linear_integration.views.exchange_code_for_token", return_value=token_data), \
             patch("linear_integration.views.save_token_for_user"):
            response = unauth_client.get(
                CALLBACK_URL, {"code": "authcode123", "state": state}
            )
        assert response.status_code == 302
        assert "linear.app" in response["Location"]

    def test_generic_exception_in_callback_redirects_error(self, unauth_client, user):
        """Any unexpected Exception during token save redirects with token_exchange_failed."""
        state = _build_state(user.id)
        with patch("linear_integration.views.exchange_code_for_token") as mock_exc:
            mock_exc.side_effect = RuntimeError("Unexpected failure")
            response = unauth_client.get(
                CALLBACK_URL, {"code": "code123", "state": state}
            )
        assert response.status_code == 302
        assert "linear_error=token_exchange_failed" in response["Location"]


# ---------------------------------------------------------------------------
# LinearStatusView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLinearStatusView:
    def test_not_connected_returns_false(self, api_client):
        response = api_client.get(STATUS_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["connected"] is False

    def test_connected_returns_true(self, api_client, credential):
        response = api_client.get(STATUS_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["connected"] is True

    def test_unauthenticated_returns_401(self, unauth_client):
        response = unauth_client.get(STATUS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# LinearDisconnectView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLinearDisconnectView:
    def test_disconnect_when_connected_deletes_credential(self, api_client, credential):
        assert LinearCredential.objects.filter(user=credential.user).exists()
        response = api_client.delete(DISCONNECT_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "disconnected" in response.data["message"].lower()
        assert not LinearCredential.objects.filter(user=credential.user).exists()

    def test_disconnect_when_not_connected_returns_success(self, api_client):
        response = api_client.delete(DISCONNECT_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "disconnected" in response.data["message"].lower()

    def test_unauthenticated_returns_401(self, unauth_client):
        response = unauth_client.delete(DISCONNECT_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# LinearTeamsView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLinearTeamsView:
    def test_not_connected_returns_400(self, api_client):
        response = api_client.get(TEAMS_URL)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not connected" in response.data["detail"].lower()

    def test_connected_returns_teams(self, api_client, credential):
        teams = [{"id": "team1", "name": "Engineering"}, {"id": "team2", "name": "Design"}]
        with patch("linear_integration.views.fetch_teams", return_value=teams):
            response = api_client.get(TEAMS_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["teams"] == teams

    def test_graphql_error_returns_422(self, api_client, credential):
        with patch("linear_integration.views.fetch_teams") as mock_fetch:
            mock_fetch.side_effect = LinearGraphQLError("GraphQL error")
            response = api_client.get(TEAMS_URL)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_unauthenticated_returns_401(self, unauth_client):
        response = unauth_client.get(TEAMS_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# LinearTeamIssuesView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLinearTeamIssuesView:
    def test_missing_team_id_returns_400(self, api_client):
        response = api_client.get(ISSUES_URL)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "team_id" in response.data["detail"].lower()

    def test_not_connected_returns_400(self, api_client):
        response = api_client.get(ISSUES_URL, {"team_id": "team1"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not connected" in response.data["detail"].lower()

    def test_connected_returns_issues(self, api_client, credential):
        issues = [{"id": "issue1", "title": "Bug fix"}, {"id": "issue2", "title": "Feature"}]
        with patch("linear_integration.views.fetch_team_issues", return_value=issues):
            response = api_client.get(ISSUES_URL, {"team_id": "team_abc"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["issues"] == issues

    def test_graphql_error_returns_422(self, api_client, credential):
        with patch("linear_integration.views.fetch_team_issues") as mock_fetch:
            mock_fetch.side_effect = LinearGraphQLError("Team not found")
            response = api_client.get(ISSUES_URL, {"team_id": "bad_team"})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_unauthenticated_returns_401(self, unauth_client):
        response = unauth_client.get(ISSUES_URL, {"team_id": "team1"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# LinearImportIssuesView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLinearImportIssuesView:
    def _payload(self, project, issue_ids=None):
        return {
            "project_id": project.id,
            "team_id": "team_abc",
            "issue_ids": issue_ids or ["issue1"],
        }

    def test_missing_required_fields_returns_400(self, api_client):
        response = api_client.post(IMPORT_URL, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_project_not_found_returns_404(self, api_client, credential):
        payload = {"project_id": 99999, "team_id": "t1", "issue_ids": ["i1"]}
        response = api_client.post(IMPORT_URL, payload, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_not_a_project_member_returns_403(self, api_client, credential, organization, db):
        other_project = Project.objects.create(
            name="Other Project",
            organization=organization,
        )
        payload = {"project_id": other_project.id, "team_id": "t1", "issue_ids": ["i1"]}
        response = api_client.post(IMPORT_URL, payload, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_not_connected_returns_400(self, api_client, project):
        response = api_client.post(IMPORT_URL, self._payload(project), format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not connected" in response.data["detail"].lower()

    def test_successful_import_creates_task(self, api_client, credential, project, user):
        """Import succeeds when TaskSerializer validates and saves correctly.
        We mock TaskSerializer because it requires current_approver_id for 'execution' type,
        but the import view doesn't pass one (tested separately in task tests).
        """
        issue = {"id": "issue_lin_1", "title": "My Linear Issue", "description": "Some desc"}
        mock_task = MagicMock()
        mock_task.id = 9001
        mock_task.linear_issue_id = ""

        mock_ser_instance = MagicMock()
        mock_ser_instance.is_valid.return_value = True
        mock_ser_instance.save.return_value = mock_task

        with patch("linear_integration.views.fetch_issue_for_import", return_value=issue), \
             patch("linear_integration.views.TaskSerializer", return_value=mock_ser_instance):
            response = api_client.post(
                IMPORT_URL,
                self._payload(project, issue_ids=["issue_lin_1"]),
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["created"]) == 1
        assert response.data["created"][0]["issue_id"] == "issue_lin_1"
        assert len(response.data["skipped"]) == 0
        assert len(response.data["errors"]) == 0

    def test_already_imported_issue_is_skipped(self, api_client, credential, project, task):
        # Set linear_issue_id on existing task so it appears "already imported"
        task.linear_issue_id = "existing_lin_issue"
        task.save(update_fields=["linear_issue_id"])

        with patch("linear_integration.views.fetch_issue_for_import") as mock_fetch:
            response = api_client.post(
                IMPORT_URL,
                self._payload(project, issue_ids=["existing_lin_issue"]),
                format="json",
            )
        # fetch_issue_for_import should NOT be called (skipped before API call)
        mock_fetch.assert_not_called()
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["skipped"]) == 1
        assert response.data["skipped"][0]["reason"] == "already_imported"

    def test_graphql_error_adds_to_errors(self, api_client, credential, project):
        with patch("linear_integration.views.fetch_issue_for_import") as mock_fetch:
            mock_fetch.side_effect = LinearGraphQLError("Not found")
            response = api_client.post(
                IMPORT_URL,
                self._payload(project, issue_ids=["bad_issue"]),
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["errors"]) == 1
        assert response.data["errors"][0]["issue_id"] == "bad_issue"

    def test_fetch_issue_returns_none_adds_to_errors(self, api_client, credential, project):
        with patch("linear_integration.views.fetch_issue_for_import", return_value=None):
            response = api_client.post(
                IMPORT_URL,
                self._payload(project, issue_ids=["missing_issue"]),
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["errors"]) == 1
        assert response.data["errors"][0]["reason"] == "not_found_or_team_mismatch"

    def test_unauthenticated_returns_401(self, unauth_client, project):
        response = unauth_client.post(
            IMPORT_URL,
            {"project_id": project.id, "team_id": "t1", "issue_ids": ["i1"]},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# LinearPushTaskView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLinearPushTaskView:
    def test_invalid_serializer_returns_400(self, api_client):
        response = api_client.post(PUSH_URL, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_task_not_found_returns_404(self, api_client, credential):
        response = api_client.post(PUSH_URL, {"task_id": 99999}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_not_a_project_member_returns_403(self, api_client, credential, organization, db):
        other_user = User.objects.create_user(
            username=f"other_{uuid.uuid4().hex[:6]}",
            email=f"other_{uuid.uuid4().hex[:6]}@test.com",
            password="pass123",
            organization=organization,
        )
        other_project = Project.objects.create(
            name="Other Project",
            organization=organization,
            owner=other_user,
        )
        other_task = Task.objects.create(
            summary="Other Task",
            type="execution",
            project=other_project,
            owner=other_user,
        )
        response = api_client.post(PUSH_URL, {"task_id": other_task.id, "team_id": "t1"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_no_team_id_and_no_linear_issue_id_returns_400(self, api_client, credential, task):
        """When task has no linear_issue_id and no team_id provided → 400."""
        response = api_client.post(PUSH_URL, {"task_id": task.id}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "team_id" in response.data["detail"].lower()

    def test_push_creates_new_issue(self, api_client, credential, task):
        result = {"action": "created", "linear_issue_id": "LIN-123", "task_id": task.id}
        with patch("linear_integration.views.push_task_to_linear", return_value=result):
            response = api_client.post(
                PUSH_URL, {"task_id": task.id, "team_id": "team_abc"}, format="json"
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["action"] == "created"
        assert response.data["linear_issue_id"] == "LIN-123"

    def test_push_updates_existing_issue(self, api_client, credential, task):
        task.linear_issue_id = "existing-lin-issue"
        task.save(update_fields=["linear_issue_id"])

        result = {"action": "updated", "linear_issue_id": "existing-lin-issue", "task_id": task.id}
        with patch("linear_integration.views.push_task_to_linear", return_value=result):
            response = api_client.post(
                PUSH_URL, {"task_id": task.id}, format="json"
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["action"] == "updated"

    def test_value_error_returns_400(self, api_client, credential, task):
        with patch("linear_integration.views.push_task_to_linear") as mock_push:
            mock_push.side_effect = ValueError("Linear is not connected.")
            response = api_client.post(
                PUSH_URL, {"task_id": task.id, "team_id": "team1"}, format="json"
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_graphql_error_returns_422(self, api_client, credential, task):
        with patch("linear_integration.views.push_task_to_linear") as mock_push:
            mock_push.side_effect = LinearGraphQLError("Team not found", errors=[{"message": "Team not found"}])
            response = api_client.post(
                PUSH_URL, {"task_id": task.id, "team_id": "bad_team"}, format="json"
            )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "linear_graphql_errors" in response.data

    def test_unauthenticated_returns_401(self, unauth_client):
        response = unauth_client.post(PUSH_URL, {"task_id": 1, "team_id": "t1"}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# LinearCredential model
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLinearCredentialModel:
    def test_set_and_get_access_token(self, user):
        cred = LinearCredential(user=user)
        cred.set_access_token("my_secret_token")
        cred.save()
        cred.refresh_from_db()
        assert cred.get_access_token() == "my_secret_token"

    def test_str_representation(self, user):
        cred = LinearCredential(user=user)
        cred.set_access_token("token")
        cred.save()
        assert "LinearCredential" in str(cred)
