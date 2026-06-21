from django.urls import include, path
from rest_framework.routers import DefaultRouter

from meetings.views import (
    MeetingViewSet,
    AgendaItemViewSet,
    ParticipantLinkViewSet,
    ArtifactLinkViewSet,
    MeetingActionItemViewSet,
    MeetingDocumentAPIView,
    MeetingAuditLogViewSet,
)


router = DefaultRouter()
router.register(
    r"projects/(?P<project_id>[^/.]+)/meetings",
    MeetingViewSet,
    basename="project-meetings",
)
router.register(
    r"projects/(?P<project_id>[^/.]+)/meetings/(?P<meeting_id>[^/.]+)/agenda-items",
    AgendaItemViewSet,
    basename="project-meeting-agenda-items",
)
router.register(
    r"projects/(?P<project_id>[^/.]+)/meetings/(?P<meeting_id>[^/.]+)/participants",
    ParticipantLinkViewSet,
    basename="project-meeting-participants",
)
router.register(
    r"projects/(?P<project_id>[^/.]+)/meetings/(?P<meeting_id>[^/.]+)/artifacts",
    ArtifactLinkViewSet,
    basename="project-meeting-artifacts",
)
router.register(
    r"projects/(?P<project_id>[^/.]+)/meetings/(?P<meeting_id>[^/.]+)/action-items",
    MeetingActionItemViewSet,
    basename="project-meeting-action-items",
)
router.register(
    r"projects/(?P<project_id>[^/.]+)/meetings/(?P<meeting_id>[^/.]+)/audit-log",
    MeetingAuditLogViewSet,
    basename="project-meeting-audit-log",
)


urlpatterns = [
    path(
        "projects/<str:project_id>/meetings/<str:meeting_id>/action-items/<int:pk>/convert-to-task/",
        MeetingActionItemViewSet.as_view({"post": "convert_to_task"}),
        name="project-meeting-action-item-convert-to-task",
    ),
    path(
        "projects/<str:project_id>/meetings/<str:meeting_id>/action-items/bulk-convert-to-tasks/",
        MeetingActionItemViewSet.as_view({"post": "bulk_convert_to_tasks"}),
        name="project-meeting-action-items-bulk-convert-to-tasks",
    ),
    path(
        "projects/<str:project_id>/meetings/<str:meeting_id>/document/",
        MeetingDocumentAPIView.as_view(),
    ),
    path("", include(router.urls)),
]

