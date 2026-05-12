from django.urls import path

from tracking import views

urlpatterns = [
    path('config/', views.ConfigView.as_view(), name='tracking-config'),
    path('sessions/', views.SessionCreateView.as_view(), name='tracking-session-create'),
    path('sessions/<uuid:pk>/heartbeat/', views.HeartbeatView.as_view(), name='tracking-heartbeat'),
    path('sessions/<uuid:pk>/end/', views.SessionEndView.as_view(), name='tracking-session-end'),
    path('events/', views.EventBulkCreateView.as_view(), name='tracking-event-bulk-create'),
    path('tasks/<int:task_id>/engagement/', views.TaskEngagementView.as_view(), name='tracking-task-engagement'),
]
