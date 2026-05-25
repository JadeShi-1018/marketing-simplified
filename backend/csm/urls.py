from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    QueueViewSet, QueueAgentViewSet,
    QueueTeamViewSet, CSMInvitationViewSet,
)

router = DefaultRouter()
router.register(r'queues', QueueViewSet, basename='queue')
router.register(r'invitations', CSMInvitationViewSet, basename='invitation')

urlpatterns = [
    # Standard routes: /queues/, /queues/{id}/, /invitations/, etc.
    path('', include(router.urls)),

    # Nested routes: project-scoped list & create
    path(
        'projects/<int:project_id>/queues/',
        QueueViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='project-queues',
    ),
    path(
        'projects/<int:project_id>/invitations/',
        CSMInvitationViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='project-invitations',
    ),

    # Nested routes: queue-scoped agent management
    path(
        'queues/<int:queue_id>/agents/',
        QueueAgentViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='queue-agents',
    ),
    path(
        'queues/<int:queue_id>/agents/<int:pk>/',
        QueueAgentViewSet.as_view({'delete': 'destroy'}),
        name='queue-agent-detail',
    ),

    # Nested routes: queue-scoped team management
    path(
        'queues/<int:queue_id>/teams/',
        QueueTeamViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='queue-teams',
    ),
    path(
        'queues/<int:queue_id>/teams/<int:pk>/',
        QueueTeamViewSet.as_view({'delete': 'destroy'}),
        name='queue-team-detail',
    ),
]
