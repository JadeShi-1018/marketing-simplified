from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count, Q

from core.admin_permissions import IsCsmAccessAllowed

from .models import Queue, QueueAgent, QueueTeam, CustomerUser, Ticket, CsmNotification
from .serializers import (
    QueueSerializer, QueueAgentSerializer,
    QueueTeamSerializer, CustomerUserSerializer,
    CsmNotificationSerializer,
)


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
    permission_classes = [IsAuthenticated, IsCsmAccessAllowed]

    def get_queryset(self):
        from core.admin_utils import get_csm_admin_org_ids

        queryset = Queue.objects.filter(is_active=True).select_related('organisation')
        user = self.request.user

        org_id = self.request.query_params.get('organisation')
        if org_id:
            queryset = queryset.filter(organisation_id=org_id)

        admin_org_ids = get_csm_admin_org_ids(user)
        return queryset.filter(organisation_id__in=admin_org_ids)

    def perform_destroy(self, instance):
        """Soft delete: mark as inactive instead of removing from DB."""
        instance.is_active = False
        instance.save()

    @action(detail=True, methods=['get'])
    def ticket_counts(self, request, pk=None):
        """GET /queues/{id}/ticket_counts/"""
        queue = self.get_object()
        counts = Ticket.objects.filter(queue=queue).aggregate(
            todo=Count('id', filter=Q(status='todo')),
            in_progress=Count('id', filter=Q(status='in_progress')),
        )
        return Response(counts)


class QueueAgentViewSet(viewsets.ModelViewSet):
    """Manage agent assignments within a queue."""
    serializer_class = QueueAgentSerializer
    permission_classes = [IsAuthenticated, IsCsmAccessAllowed]
    http_method_names = ['get', 'post', 'delete']

    def get_queryset(self):
        queue_id = self.kwargs.get('queue_id')
        return QueueAgent.objects.filter(queue_id=queue_id)

    def perform_create(self, serializer):
        queue_id = self.kwargs.get('queue_id')
        serializer.save(
            queue_id=queue_id,
            assigned_by=self.request.user,
        )


class QueueTeamViewSet(viewsets.ModelViewSet):
    """Manage team assignments within a queue."""
    serializer_class = QueueTeamSerializer
    permission_classes = [IsAuthenticated, IsCsmAccessAllowed]
    http_method_names = ['get', 'post', 'delete']

    def get_queryset(self):
        queue_id = self.kwargs.get('queue_id')
        return QueueTeam.objects.filter(queue_id=queue_id)

    def perform_create(self, serializer):
        queue_id = self.kwargs.get('queue_id')
        serializer.save(queue_id=queue_id)


class CustomerUserViewSet(viewsets.ModelViewSet):
    """
    CSM user management.

    - GET    /projects/{pid}/customer-users/     list
    - POST   /projects/{pid}/customer-users/     create
    - PATCH  /customer-users/{id}/               update
    - DELETE /customer-users/{id}/               delete
    """
    serializer_class = CustomerUserSerializer
    permission_classes = [IsAuthenticated, IsCsmAccessAllowed]

    def get_queryset(self):
        from core.admin_utils import get_csm_admin_org_ids

        qs = CustomerUser.objects.select_related('user', 'team', 'queue', 'organisation')
        user = self.request.user

        org_id = self.request.query_params.get('organisation')
        if org_id:
            qs = qs.filter(organisation_id=org_id)

        admin_org_ids = get_csm_admin_org_ids(user)
        return qs.filter(organisation_id__in=admin_org_ids)

    def perform_create(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        if instance.is_creator:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'Cannot delete the organisation creator.'})
        instance.delete()

    @action(detail=False, methods=['post'])
    def invite(self, request):
        """Invite an existing user to a CSM organisation via in-app notification."""
        from core.admin_utils import get_csm_admin_org_ids
        from .models import CsmNotification
        from django.contrib.auth import get_user_model
        User = get_user_model()

        org_id = request.data.get('organisation')
        user_id = request.data.get('user_id')
        user_type = request.data.get('user_type', 'agent')
        message = request.data.get('message', '')

        if not org_id or not user_id:
            return Response(
                {'detail': 'organisation and user_id are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        admin_org_ids = get_csm_admin_org_ids(request.user)
        try:
            org_id = int(org_id)
        except (TypeError, ValueError):
            return Response(
                {'detail': 'Invalid organisation ID.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if org_id not in admin_org_ids:
            return Response(
                {'detail': 'You are not an admin of this organisation.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if CustomerUser.objects.filter(user=target_user, organisation_id=org_id).exists():
            return Response(
                {'detail': 'User is already a member of this organisation.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check for existing pending invitation
        if CsmNotification.objects.filter(
            recipient=target_user,
            organisation_id=org_id,
            notification_type='org_invitation',
            action_status='pending',
        ).exists():
            return Response(
                {'detail': 'A pending invitation already exists for this user.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from customer.models import CustomerOrganisation
        try:
            org = CustomerOrganisation.objects.get(id=org_id)
        except CustomerOrganisation.DoesNotExist:
            return Response(
                {'detail': 'Organisation not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        CsmNotification.objects.create(
            recipient=target_user,
            sender=request.user,
            notification_type='org_invitation',
            title=f'Invitation to join {org.name}',
            message=message,
            metadata={'user_type': user_type, 'organisation_id': org_id},
            organisation=org,
        )

        return Response(
            {'detail': f'Invitation sent to {target_user.email}.'},
            status=status.HTTP_201_CREATED,
        )



class CsmNotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Notification endpoints for the current user.

    - GET  /notifications/           — list my notifications
    - GET  /notifications/{id}/      — retrieve single notification
    - GET  /notifications/unread_count/ — count of unread notifications
    - POST /notifications/{id}/mark_read/ — mark as read
    - POST /notifications/{id}/accept/   — accept org invitation
    - POST /notifications/{id}/decline/  — decline org invitation
    """
    serializer_class = CsmNotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CsmNotification.objects.filter(
            recipient=self.request.user,
        ).select_related('sender', 'organisation').order_by('-created_at')

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        count = CsmNotification.objects.filter(
            recipient=request.user,
            is_read=False,
        ).count()
        return Response({'count': count})

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read'])
        return Response(CsmNotificationSerializer(notification).data)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        notification = self.get_object()
        if notification.notification_type != 'org_invitation':
            return Response(
                {'detail': 'This notification cannot be accepted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if notification.action_status != 'pending':
            return Response(
                {'detail': f'Invitation already {notification.action_status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_type = notification.metadata.get('user_type', 'agent')
        org_id = notification.metadata.get('organisation_id') or (
            notification.organisation_id
        )

        # Create CustomerUser record
        CustomerUser.objects.get_or_create(
            user=request.user,
            organisation_id=org_id,
            defaults={
                'user_type': user_type,
                'is_active': True,
            },
        )

        notification.action_status = 'accepted'
        notification.is_read = True
        notification.save(update_fields=['action_status', 'is_read'])
        return Response(CsmNotificationSerializer(notification).data)

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        notification = self.get_object()
        if notification.notification_type != 'org_invitation':
            return Response(
                {'detail': 'This notification cannot be declined.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if notification.action_status != 'pending':
            return Response(
                {'detail': f'Invitation already {notification.action_status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        notification.action_status = 'declined'
        notification.is_read = True
        notification.save(update_fields=['action_status', 'is_read'])
        return Response(CsmNotificationSerializer(notification).data)
