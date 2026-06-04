from django.urls import path

from tracking import views

urlpatterns = [
    path('config/', views.ConfigView.as_view(), name='tracking-config'),
    path('events/', views.TrackingEventListView.as_view(), name='tracking-events'),
    path('tasks/<int:task_id>/engagement/', views.TaskEngagementView.as_view(), name='tracking-task-engagement'),
]
