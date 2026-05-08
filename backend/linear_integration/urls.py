from django.urls import path

from . import views

urlpatterns = [
    path("connect/", views.LinearConnectView.as_view(), name="linear-connect"),
    path("callback/", views.LinearCallbackView.as_view(), name="linear-callback"),
    path("status/", views.LinearStatusView.as_view(), name="linear-status"),
    path("disconnect/", views.LinearDisconnectView.as_view(), name="linear-disconnect"),
    path("teams/", views.LinearTeamsView.as_view(), name="linear-teams"),
    path("issues/", views.LinearTeamIssuesView.as_view(), name="linear-team-issues"),
    path("import-issues/", views.LinearImportIssuesView.as_view(), name="linear-import-issues"),
    path("push-task/", views.LinearPushTaskView.as_view(), name="linear-push-task"),
]
