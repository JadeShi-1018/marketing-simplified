import logging

from rest_framework import mixins, status, viewsets
from rest_framework.parsers import JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

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
