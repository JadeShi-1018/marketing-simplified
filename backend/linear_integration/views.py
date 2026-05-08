import logging
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404, redirect
from django.utils.crypto import get_random_string
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Project, ProjectMember
from task.models import Task
from task.serializers import TaskSerializer

from .linear_graphql import (
    LinearGraphQLError,
    fetch_issue_for_import,
    fetch_team_issues,
    fetch_teams,
)
from .models import LinearCredential
from .serializers import LinearImportIssuesSerializer, LinearPushTaskSerializer
from .services import (
    LINEAR_APP_AFTER_LOGIN,
    LinearTokenExchangeError,
    build_authorization_url,
    exchange_code_for_token,
    generate_pkce_pair,
    get_linear_access_token,
    linear_oauth_env_missing,
    push_task_to_linear,
    save_token_for_user,
)

logger = logging.getLogger(__name__)

LINEAR_OAUTH_STATE_SALT = "linear-oauth-state"
# OAuth round-trip (login + authorize) can exceed a few minutes; 10m was too tight in practice.
LINEAR_OAUTH_STATE_MAX_AGE_SECONDS = int(
    getattr(settings, "LINEAR_OAUTH_STATE_MAX_AGE_SECONDS", 3600)
)


def _frontend_base_for_oauth_redirect(request) -> str:
    """
    Browser base URL for post-OAuth redirects.

    Docker+Nginx users open the app at http://localhost (port 80), while FRONTEND_URL
    defaults to http://localhost:3000 — errors would redirect to the wrong origin and
    look like "connection still broken" with no toast. Prefer the host the client used
    to hit this callback.
    """
    try:
        return request.build_absolute_uri("/").rstrip("/")
    except Exception:
        return (getattr(settings, "FRONTEND_URL", None) or "http://localhost:3000").rstrip("/")


def _build_linear_oauth_state(user, code_verifier: str) -> str:
    return signing.dumps(
        {"user_id": user.id, "nonce": get_random_string(16), "cv": code_verifier},
        salt=LINEAR_OAUTH_STATE_SALT,
    )


class LinearConnectView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        missing = linear_oauth_env_missing()
        if missing:
            return Response(
                {
                    "error": "Linear OAuth is not configured on the server.",
                    "missing_env": missing,
                    "detail": f"Set {', '.join(missing)} in the backend environment and restart.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        try:
            code_verifier, code_challenge = generate_pkce_pair()
            state = _build_linear_oauth_state(request.user, code_verifier)
            auth_url = build_authorization_url(state, code_challenge)
        except Exception as exc:
            logger.warning("Linear connect misconfigured: %s", exc)
            return Response(
                {"error": "Linear integration is not configured on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"auth_url": auth_url})


class LinearCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        code = request.query_params.get("code")
        state = request.query_params.get("state")

        base_fe = _frontend_base_for_oauth_redirect(request)

        def err_redirect(code_key: str, detail: str | None = None):
            q = f"linear_error={code_key}"
            if detail:
                q += f"&linear_detail={quote(detail[:400], safe='')}"
            return redirect(f"{base_fe}/integrations?{q}")

        # Opening /api/v1/linear/callback/ in the browser has no ?code=&state= — that is not how OAuth works.
        if not state and not code:
            return err_redirect(
                "oauth_incomplete",
                detail="Open the app Integrations page and click Connect Linear; do not bookmark or open this callback URL directly.",
            )
        if not state:
            return err_redirect("invalid_state")
        try:
            payload = signing.loads(
                state,
                salt=LINEAR_OAUTH_STATE_SALT,
                max_age=LINEAR_OAUTH_STATE_MAX_AGE_SECONDS,
            )
        except signing.SignatureExpired:
            return err_redirect("state_expired")
        except signing.BadSignature:
            return err_redirect("invalid_state")

        user_id = payload.get("user_id")
        if not user_id:
            return err_redirect("invalid_state")
        code_verifier = payload.get("cv")
        if not code_verifier or not isinstance(code_verifier, str):
            return err_redirect("invalid_state")

        if not code:
            error = request.query_params.get("error", "access_denied")
            return err_redirect(error)

        User = get_user_model()
        try:
            user = User.objects.get(id=user_id)
            token_data = exchange_code_for_token(code, code_verifier)
            save_token_for_user(user, token_data)
        except User.DoesNotExist:
            return err_redirect("user_not_found")
        except LinearTokenExchangeError as exc:
            logger.warning("Linear token exchange failed user_id=%s: %s", user_id, exc.message)
            return err_redirect("token_exchange_failed", detail=exc.message)
        except ValueError as exc:
            logger.warning("Linear OAuth save failed user_id=%s: %s", user_id, exc)
            return err_redirect("token_exchange_failed", detail=str(exc))
        except Exception as exc:
            logger.exception("Linear OAuth callback failed for user_id=%s", user_id)
            return err_redirect(
                "token_exchange_failed",
                detail=f"{type(exc).__name__}: {exc}"[:400],
            )

        return redirect(LINEAR_APP_AFTER_LOGIN)


class LinearStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        connected = LinearCredential.objects.filter(user=request.user).exists()
        return Response({"connected": connected})


class LinearDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        LinearCredential.objects.filter(user=request.user).delete()
        return Response({"message": "Successfully disconnected from Linear"})


class LinearTeamsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        token = get_linear_access_token(request.user)
        if not token:
            return Response({"detail": "Linear is not connected."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            teams = fetch_teams(token)
        except LinearGraphQLError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        return Response({"teams": teams})


class LinearTeamIssuesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        team_id = request.query_params.get("team_id")
        if not team_id:
            return Response({"detail": "team_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        token = get_linear_access_token(request.user)
        if not token:
            return Response({"detail": "Linear is not connected."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            issues = fetch_team_issues(token, team_id)
        except LinearGraphQLError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        return Response({"issues": issues})


class LinearImportIssuesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = LinearImportIssuesSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        project_id = ser.validated_data["project_id"]
        team_id = ser.validated_data["team_id"]
        issue_ids = ser.validated_data["issue_ids"]

        project = get_object_or_404(Project, pk=project_id)
        if not ProjectMember.objects.filter(
            user=request.user, project=project, is_active=True
        ).exists():
            return Response(
                {"detail": "You are not a member of this project."},
                status=status.HTTP_403_FORBIDDEN,
            )

        token = get_linear_access_token(request.user)
        if not token:
            return Response({"detail": "Linear is not connected."}, status=status.HTTP_400_BAD_REQUEST)

        created: list[dict] = []
        skipped: list[dict] = []
        errors: list[dict] = []

        for issue_id in issue_ids:
            if Task.objects.filter(project=project, linear_issue_id=issue_id).exists():
                skipped.append({"issue_id": issue_id, "reason": "already_imported"})
                continue
            try:
                issue = fetch_issue_for_import(token, issue_id, team_id)
            except LinearGraphQLError as exc:
                errors.append({"issue_id": issue_id, "reason": str(exc)})
                continue
            if not issue:
                errors.append({"issue_id": issue_id, "reason": "not_found_or_team_mismatch"})
                continue

            title = (issue.get("title") or "").strip() or "Imported from Linear"
            description = issue.get("description") or ""
            payload = {
                "project_id": project_id,
                "type": "execution",
                "summary": title[:255],
                "description": description,
            }
            task_ser = TaskSerializer(data=payload, context={"request": request})
            if not task_ser.is_valid():
                errors.append({"issue_id": issue_id, "reason": task_ser.errors})
                continue
            try:
                with transaction.atomic():
                    task = task_ser.save()
                    task.linear_issue_id = issue["id"]
                    task.save(update_fields=["linear_issue_id"])
            except IntegrityError:
                skipped.append({"issue_id": issue_id, "reason": "already_imported"})
                continue
            created.append({"issue_id": issue_id, "task_id": task.id})

        return Response(
            {
                "created": created,
                "skipped": skipped,
                "errors": errors,
            }
        )


class LinearPushTaskView(APIView):
    """Create or update a Linear issue from a MediaJira task (OAuth: read, write, issues:create)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = LinearPushTaskSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        task = get_object_or_404(Task.objects.select_related("project"), pk=ser.validated_data["task_id"])
        if not ProjectMember.objects.filter(
            user=request.user, project=task.project, is_active=True
        ).exists():
            raise PermissionDenied("You are not a member of this task's project.")

        team_id = (ser.validated_data.get("team_id") or "").strip()
        if not (getattr(task, "linear_issue_id", None) or "").strip() and not team_id:
            return Response(
                {"detail": "team_id is required when the task is not linked to a Linear issue."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = push_task_to_linear(user=request.user, task=task, team_id=team_id or None)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except LinearGraphQLError as exc:
            logger.warning("Linear push-task GraphQL error: %s errors=%s", exc, exc.errors)
            payload: dict = {"detail": str(exc)}
            if exc.errors:
                payload["linear_graphql_errors"] = exc.errors
            return Response(payload, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        return Response(result, status=status.HTTP_200_OK)
