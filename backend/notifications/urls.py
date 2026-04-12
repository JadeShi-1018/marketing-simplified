from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    NotificationClearView,
    NotificationMarkReadView,
    NotificationViewSet,
    UserNotificationPreferenceView,
    stream_notifications,
)

router = DefaultRouter()
router.register(r"notifications", NotificationViewSet, basename="notification")

urlpatterns = [
    path("", include(router.urls)),
    path("notifications/read/", NotificationMarkReadView.as_view(), name="notifications-read"),
    path("notifications/clear/", NotificationClearView.as_view(), name="notifications-clear"),
    path("notifications/stream/", stream_notifications, name="notifications-stream"),
    path("notification-preferences/", UserNotificationPreferenceView.as_view(), name="notification-preferences"),
]
