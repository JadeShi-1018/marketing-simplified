from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from datetime import timedelta

from .models import Queue, QueueAgent, QueueTeam, CSMInvitation
from .serializers import (
    QueueSerializer, QueueAgentSerializer,
    QueueTeamSerializer, CSMInvitationSerializer,
)
from core.utils.invitations import generate_invitation_token


class QueueViewSet(viewsets.ModelViewSet):
    """
    Queue CRUD.

    - GET    /projects/{pid}/queues/     list
    - POST   /projects/{pid}/queues/     create
    - GET    /queues/{id}/               retrieve
    - PATCH  /queues/{id}/               update
    - DELETE /queues/{id}/               soft delete
    """
    serializer_class = QueueSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Queue.objects.filter(is_active=True)

        project_id = self.kwargs.get('project_id')
        if project_id:
            # Project-scoped: show all queues in the project
            queryset = queryset.filter(project_id=project_id)
        elif not self.request.user.is_staff:
            # No project scope + non-staff: only show assigned queues
            my_queues = QueueAgent.objects.filter(user=self.request.user).values_list('queue_id', flat=True)
            queryset = queryset.filter(id__in=my_queues)

        return queryset

    def perform_destroy(self, instance):
        """Soft delete: mark as inactive instead of removing from DB."""
        instance.is_active = False
        instance.save()

    @action(detail=True, methods=['get'])
    def ticket_counts(self, request, pk=None):
        """
        GET /queues/{id}/ticket-counts/
        Placeholder: returns zeros until Ticket model is built.
        """
        return Response({'todo': 0, 'in_progress': 0})


class QueueAgentViewSet(viewsets.ModelViewSet):
    """
    Manage agent assignments within a queue.

    - GET    /queues/{queue_id}/agents/           list agents in queue
    - POST   /queues/{queue_id}/agents/           assign agent
    - DELETE /queues/{queue_id}/agents/{id}/       remove agent
    """
    serializer_class = QueueAgentSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'delete']

    def get_queryset(self):
        queue_id = self.kwargs.get('queue_id')
        return QueueAgent.objects.filter(queue_id=queue_id)

    def perform_create(self, serializer):
        """Auto-fill queue from URL and assigned_by from current user."""
        queue_id = self.kwargs.get('queue_id')
        serializer.save(
            queue_id=queue_id,
            assigned_by=self.request.user,
        )


class QueueTeamViewSet(viewsets.ModelViewSet):
    """
    Manage team assignments within a queue.

    - GET    /queues/{queue_id}/teams/            list teams in queue
    - POST   /queues/{queue_id}/teams/            assign team
    - DELETE /queues/{queue_id}/teams/{id}/        remove team
    """
    serializer_class = QueueTeamSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'delete']

    def get_queryset(self):
        queue_id = self.kwargs.get('queue_id')
        return QueueTeam.objects.filter(queue_id=queue_id)

    def perform_create(self, serializer):
        queue_id = self.kwargs.get('queue_id')
        serializer.save(queue_id=queue_id)


class CSMInvitationViewSet(viewsets.ModelViewSet):
    """
    Member invitation management.

    - GET    /projects/{pid}/invitations/          list pending invitations
    - POST   /projects/{pid}/invitations/          send invitation
    - DELETE /invitations/{id}/                    revoke invitation
    - POST   /invitations/accept/                  accept invitation
    """
    serializer_class = CSMInvitationSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'delete']

    def get_queryset(self):
        project_id = self.kwargs.get('project_id')
        queryset = CSMInvitation.objects.filter(accepted=False)
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset

    def perform_create(self, serializer):
        """
        Invitation creation logic:
        1. Check for existing pending non-expired invitation
        2. Generate secure token
        3. Set 72-hour expiry
        4. Save record
        """
        email = serializer.validated_data['email']
        project = serializer.validated_data['project']

        existing = CSMInvitation.objects.filter(
            email=email, project=project, accepted=False,
        ).first()
        if existing and not existing.is_expired():
            raise serializers.ValidationError(
                {'email': 'A pending invitation already exists for this email'}
            )

        serializer.save(
            invited_by=self.request.user,
            token=generate_invitation_token(),
            expires_at=timezone.now() + timedelta(hours=72),
        )

    @action(detail=False, methods=['post'])
    def accept(self, request):
        """
        POST /invitations/accept/  {"token": "xxx"}
        Validate token -> check expiry -> mark as accepted
        """
        token = request.data.get('token')
        if not token:
            return Response(
                {'error': 'token is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            invitation = CSMInvitation.objects.get(token=token, accepted=False)
        except CSMInvitation.DoesNotExist:
            return Response(
                {'error': 'Invalid or already used invitation link'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if invitation.is_expired():
            return Response(
                {'error': 'Invitation link has expired, please contact admin to resend'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invitation.accepted = True
        invitation.accepted_at = timezone.now()
        invitation.save()

        # If invitation specified a team, add user to that team
        if invitation.team:
            from core.models import TeamMember, TeamRole
            TeamMember.objects.get_or_create(
                user=request.user,
                team=invitation.team,
                defaults={'role_id': TeamRole.MEMBER},
            )

        return Response(
            CSMInvitationSerializer(invitation).data,
            status=status.HTTP_200_OK,
        )
