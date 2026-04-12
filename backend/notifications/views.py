import logging

from asgiref.sync import sync_to_async
from django.contrib.auth import get_user_model
from django.http import HttpResponse, StreamingHttpResponse
from rest_framework import mixins, status, viewsets
from rest_framework.parsers import JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .sse import sse_event_generator

logger = logging.getLogger(__name__)

from .models import (
    DEADLINE_TAB_EVENT_TYPES,
    MENTION_TAB_EVENT_TYPES,
    Notification,
    UserNotificationPreference,
    default_notification_preferences,
)
from .serializers import (
    NotificationClearSerializer,
    NotificationMarkReadSerializer,
    NotificationSerializer,
    UserNotificationPreferencePatchSerializer,
)
from .services import (
    apply_and_save_notification_preferences,
    clear_notifications,
    coalesce_preferences,
    filter_notifications_for_user,
    mark_notifications_read,
)


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        category = request.query_params.get("category")
        is_read_param = request.query_params.get("is_read")
        tab = request.query_params.get("tab", "all")

        is_read = None
        if is_read_param is not None:
            if is_read_param.lower() in ("true", "1", "yes"):
                is_read = True
            elif is_read_param.lower() in ("false", "0", "no"):
                is_read = False

        qs = filter_notifications_for_user(
            qs,
            category=category or None,
            is_read=is_read,
            tab=tab if tab != "all" else None,
        )

        page = self.paginate_queryset(qs)
        unread_total = Notification.objects.filter(recipient=request.user, is_read=False).count()

        tab_counts = {
            "all": Notification.objects.filter(recipient=request.user).count(),
            "unread": unread_total,
            "mentions": Notification.objects.filter(
                recipient=request.user,
                event_type__in=MENTION_TAB_EVENT_TYPES,
            ).count(),
            "deadlines": Notification.objects.filter(
                recipient=request.user,
                event_type__in=DEADLINE_TAB_EVENT_TYPES,
            ).count(),
        }

        if page is not None:
            ser = self.get_serializer(page, many=True)
            response = self.get_paginated_response(ser.data)
            response.data["unread_count"] = unread_total
            response.data["tab_counts"] = tab_counts
            return response

        ser = self.get_serializer(qs, many=True)
        return Response(
            {
                "results": ser.data,
                "unread_count": unread_total,
                "tab_counts": tab_counts,
            }
        )


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        ser = NotificationMarkReadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        mark_all = ser.validated_data.get("mark_all", False)
        ids = [str(x) for x in ser.validated_data.get("ids") or []]
        updated = mark_notifications_read(request.user, ids, mark_all=mark_all)
        return Response({"updated": updated})


class NotificationClearView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        ser = NotificationClearSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        scope = ser.validated_data["scope"]
        ids = [str(x) for x in ser.validated_data.get("ids") or []]
        deleted = clear_notifications(request.user, scope=scope, ids=ids)
        return Response({"deleted": deleted})


class UserNotificationPreferenceView(APIView):
    """
    Use JWT only so browser PATCH requests are not subject to SessionAuthentication CSRF checks.
    """

    authentication_classes = [JWTAuthentication]
    parser_classes = [JSONParser]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Always return coalesced defaults when no row exists or when preferences JSON is empty.
        On unexpected errors (e.g. DB), still return default-shaped preferences so the client can render.
        """
        try:
            pref, _ = UserNotificationPreference.objects.get_or_create(
                user=request.user,
                defaults={"preferences": default_notification_preferences()},
            )
            merged = coalesce_preferences(pref.preferences)
            return Response({"preferences": merged, "updated_at": pref.updated_at})
        except Exception:
            logger.exception("notification-preferences GET failed; returning default preferences")
            merged = coalesce_preferences(None)
            return Response({"preferences": merged, "updated_at": None})

    def patch(self, request):
        ser = UserNotificationPreferencePatchSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        patch_data = ser.validated_data["preferences"]
        try:
            pref = apply_and_save_notification_preferences(request.user, patch_data)
        except Exception as exc:
            logger.exception(
                "notification-preferences PATCH failed: user_id=%s",
                getattr(request.user, "pk", None),
            )
            return Response(
                {
                    "error": "Failed to save notification preferences.",
                    "detail": f"{type(exc).__name__}: {exc}",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        merged = coalesce_preferences(pref.preferences)
        return Response({"preferences": merged, "updated_at": pref.updated_at})


async def stream_notifications(request):
    """
    SSE endpoint: GET /api/notifications/stream/

    Opens a long-lived HTTP response that pushes real-time notification events
    to the authenticated browser tab using the text/event-stream protocol.

    Authentication
    --------------
    The native browser EventSource API cannot set custom headers, so the JWT
    is accepted in two ways (checked in order):

    1. ``Authorization: Bearer <token>`` header  (Axios / fetch callers)
    2. ``?token=<token>`` query parameter         (native EventSource)

    Returns HTTP 401 if no valid token is found.

    Reconnect / Last-Event-ID
    -------------------------
    The browser automatically sends a ``Last-Event-ID`` header on reconnect.
    The view replays up to 50 missed notifications from the DB before resuming
    the live Redis Pub/Sub stream.  The query param ``?lastEventId=`` serves
    as a fallback for polyfill clients.

    Nginx integration
    -----------------
    ``X-Accel-Buffering: no`` disables Nginx response buffering so events are
    delivered immediately rather than batched.
    """
    # ── 1. Extract the raw JWT string ────────────────────────────────────
    token_string: str | None = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        token_string = auth_header.split(" ", 1)[1].strip()
    elif request.GET.get("token"):
        token_string = request.GET["token"]

    if not token_string:
        return HttpResponse("Unauthorized", status=401, content_type="text/plain")

    # ── 2. Validate token and resolve user ───────────────────────────────
    try:
        from rest_framework_simplejwt.tokens import AccessToken  # noqa: PLC0415

        validated = await sync_to_async(AccessToken)(token_string)
        user_id = validated["user_id"]
        User = get_user_model()
        user = await sync_to_async(User.objects.get)(pk=user_id)
    except Exception:
        logger.warning("SSE: invalid or expired token", exc_info=True)
        return HttpResponse("Unauthorized", status=401, content_type="text/plain")

    # ── 3. Resolve Last-Event-ID ─────────────────────────────────────────
    # Browser sets the ``Last-Event-ID`` *header* automatically on reconnect;
    # the query param is a manual fallback for the initial EventSource URL.
    last_event_id = (
        request.headers.get("Last-Event-ID")
        or request.GET.get("lastEventId")
    )

    # ── 4. Return streaming response ─────────────────────────────────────
    response = StreamingHttpResponse(
        sse_event_generator(user.id, last_event_id),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"   # Prevent Nginx from buffering SSE chunks
    response["Connection"] = "keep-alive"
    return response


stream_notifications.csrf_exempt = True  # bypass CSRF without wrapping the async function
