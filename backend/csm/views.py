from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count, Q
from django.utils import timezone
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from core.admin_permissions import IsCsmAccessAllowed

from .models import Queue, QueueAgent, QueueTeam, CustomerUser, Ticket, CsmNotification, Conversation, ConversationMessage, QuickReplyTemplate, QuickReplyTemplateHistory
from .serializers import (
    QueueSerializer, QueueAgentSerializer,
    QueueTeamSerializer, CustomerUserSerializer,
    CsmNotificationSerializer,
    ConversationSerializer, ConversationDetailSerializer,
    ConversationMessageSerializer, TicketSerializer,
    QuickReplyTemplateSerializer, QuickReplyTemplateHistorySerializer,
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
    def tickets(self, request, pk=None):
        """GET /queues/{id}/tickets/ — list all tickets in this queue."""
        queue = self.get_object()
        qs = Ticket.objects.filter(queue=queue).select_related('assigned_to').order_by('-created_at')

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        return Response(TicketSerializer(qs, many=True).data)

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



class ConversationViewSet(viewsets.ModelViewSet):
    """
    Agent conversation workspace endpoints.

    - GET    /conversations/                     list (filtered to agent's queues)
    - POST   /conversations/                     create
    - GET    /conversations/{id}/                retrieve (with messages + customer profile)
    - PATCH  /conversations/{id}/                update status/queue/assigned_to/tags
    - POST   /conversations/{id}/messages/       send a message
    - POST   /conversations/{id}/create_ticket/  create ticket from conversation
    """
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        base_qs = Conversation.objects.select_related('customer', 'queue', 'assigned_to__user')

        # Permission-based filtering
        if user.is_staff or user.is_superuser:
            qs = base_qs.all()
        else:
            admin_org_ids = CustomerUser.objects.filter(
                user=user, is_active=True, user_type__in=('supervisor', 'admin')
            ).values_list('organisation_id', flat=True)

            if admin_org_ids:
                org_queue_ids = Queue.objects.filter(
                    organisation_id__in=admin_org_ids,
                ).values_list('id', flat=True)
                qs = base_qs.filter(Q(queue_id__in=org_queue_ids) | Q(queue__isnull=True))
            else:
                agent_queue_ids = QueueAgent.objects.filter(user=user).values_list('queue_id', flat=True)
                qs = base_qs.filter(Q(queue_id__in=agent_queue_ids) | Q(queue__isnull=True))

        # Optional queue filter from query params
        queue_id = self.request.query_params.get('queue')
        if queue_id:
            qs = qs.filter(queue_id=queue_id)

        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ConversationDetailSerializer
        return ConversationSerializer

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        # Prefetch messages for detail view
        instance._prefetched_objects_cache = {}
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def claim(self, request, pk=None):
        """
        POST /conversations/{id}/claim/
        Agent claims a conversation: auto-creates a Ticket linked to it,
        assigns it to the current user. If already claimed by this user, returns existing ticket.
        """
        conversation = self.get_object()

        if not conversation.queue_id:
            # Auto-assign to a queue the current user can actually access (in priority order):
            # 1. A queue this agent is explicitly assigned to
            # 2. A queue in an org where this user is admin/supervisor
            # 3. Any queue (last resort)
            queue = None
            agent_queue_qs = QueueAgent.objects.filter(user=request.user).select_related('queue')
            if agent_queue_qs.exists():
                queue = agent_queue_qs.first().queue
            if not queue:
                admin_org_ids = CustomerUser.objects.filter(
                    user=request.user, is_active=True, user_type__in=('supervisor', 'admin')
                ).values_list('organisation_id', flat=True)
                if admin_org_ids:
                    queue = Queue.objects.filter(organisation_id__in=admin_org_ids).first()
            if not queue:
                queue = Queue.objects.first()
            if not queue:
                return Response(
                    {'detail': 'No queue available. Please contact your administrator.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            Conversation.objects.filter(id=conversation.id).update(queue=queue)
            conversation.refresh_from_db()

        # 1:1 enforcement: one conversation = one ticket (any agent's)
        existing = conversation.tickets.first()
        if existing:
            return Response(TicketSerializer(existing).data, status=status.HTTP_200_OK)

        # Auto-fill title from subject (stored in tags[0]) or fallback
        title = conversation.tags[0] if conversation.tags else f'Conversation #{conversation.id}'
        first_msg = conversation.messages.filter(sender_type='customer').first()
        description = first_msg.content if first_msg else ''

        ticket = Ticket.objects.create(
            queue_id=conversation.queue_id,
            title=title,
            description=description,
            priority='medium',
            status='in_progress',
            assigned_to=request.user,
            customer_email=conversation.customer.email if conversation.customer else '',
            conversation=conversation,
        )

        Conversation.objects.filter(id=conversation.id).update(status='active')
        conversation.refresh_from_db()

        system_msg = ConversationMessage.objects.create(
            conversation=conversation,
            sender_type='system',
            content=f'Ticket #{ticket.id} claimed by {request.user.get_full_name() or request.user.email}.',
        )
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'csm_conversation_{conversation.id}',
            {'type': 'conversation.message', 'message': ConversationMessageSerializer(system_msg).data},
        )
        # Broadcast updated conversation to all agents (refreshes list)
        async_to_sync(channel_layer.group_send)(
            'csm_new_conversations',
            {'type': 'conversation.updated', 'conversation': ConversationSerializer(conversation).data},
        )

        return Response(TicketSerializer(ticket).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def messages(self, request, pk=None):
        """POST /conversations/{id}/messages/ — send a message as the current agent."""
        conversation = self.get_object()
        customer_user = CustomerUser.objects.filter(user=request.user, is_active=True).first()

        image = request.FILES.get('image')
        msg = ConversationMessage.objects.create(
            conversation=conversation,
            sender_type='agent',
            sender_agent=customer_user,
            content=request.data.get('content', ''),
            rich_body=request.data.get('rich_body') if not image else None,
            image=image,
        )

        payload = ConversationMessageSerializer(msg, context={'request': request}).data

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'csm_conversation_{conversation.id}',
            {'type': 'conversation.message', 'message': payload},
        )
        # Broadcast to customer portal so they receive the agent reply in real-time
        from portal.serializers import PortalMessageSerializer
        async_to_sync(channel_layer.group_send)(
            f'portal_conversation_{conversation.id}',
            {'type': 'conversation.message', 'message': PortalMessageSerializer(msg, context={'request': request}).data},
        )
        # Broadcast conversation_updated so all agents' lists refresh
        conversation.refresh_from_db()
        async_to_sync(channel_layer.group_send)(
            'csm_new_conversations',
            {'type': 'conversation.updated', 'conversation': ConversationSerializer(conversation).data},
        )

        return Response(payload, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def create_ticket(self, request, pk=None):
        """
        POST /conversations/{id}/create_ticket/
        Creates a Ticket pre-populated from the linked customer profile,
        establishes a bidirectional link, and posts a system message.
        """
        conversation = self.get_object()
        customer = conversation.customer

        title = request.data.get('title', f'Ticket from conversation #{conversation.id}')
        description = request.data.get('description', '')
        priority = request.data.get('priority', 'medium')
        queue_id = request.data.get('queue', conversation.queue_id)

        if not queue_id:
            return Response(
                {'detail': 'A queue must be selected to create a ticket.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ticket = Ticket.objects.create(
            queue_id=queue_id,
            title=title,
            description=description,
            priority=priority,
            customer_email=customer.email if customer else '',
            conversation=conversation,
        )

        # Post a system message in the conversation thread
        system_msg = ConversationMessage.objects.create(
            conversation=conversation,
            sender_type='system',
            content=f'Ticket #{ticket.id} created: {ticket.title}',
        )

        payload = ConversationMessageSerializer(system_msg).data
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'csm_conversation_{conversation.id}',
            {'type': 'conversation.message', 'message': payload},
        )

        return Response(
            {
                'ticket': TicketSerializer(ticket).data,
                'system_message': payload,
            },
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


class QuickReplyTemplateViewSet(viewsets.ModelViewSet):
    """
    CRUD for quick-reply templates scoped to a CSM organisation.

    - GET    /templates/?organisation={id}   list active templates
    - POST   /templates/                     create
    - GET    /templates/{id}/                retrieve
    - PATCH  /templates/{id}/               update
    - DELETE /templates/{id}/               delete (hard delete, or set is_active=False)

    Agents can list/read; only supervisors/admins can create/update/delete.
    """
    serializer_class = QuickReplyTemplateSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        from core.admin_utils import get_csm_admin_org_ids

        qs = QuickReplyTemplate.objects.filter(is_active=True).select_related('created_by', 'team')

        org_id = self.request.query_params.get('organisation')
        if org_id:
            qs = qs.filter(organisation_id=org_id)
        else:
            # Fall back to all orgs the user has access to
            accessible_org_ids = get_csm_admin_org_ids(self.request.user)
            # Also include orgs the user is an agent of
            agent_org_ids = CustomerUser.objects.filter(
                user=self.request.user, is_active=True,
            ).values_list('organisation_id', flat=True)
            all_org_ids = set(list(accessible_org_ids) + list(agent_org_ids))
            qs = qs.filter(organisation_id__in=all_org_ids)

        # Team scoping: show templates with no team, OR where the user belongs to the team
        # Two-step: Django doesn't support chaining two FK levels in a single filter argument
        customer_user_ids = CustomerUser.objects.filter(
            user=self.request.user, is_active=True,
        ).values_list('id', flat=True)
        user_queue_ids = QueueAgent.objects.filter(
            user_id__in=customer_user_ids,
        ).values_list('queue_id', flat=True)
        user_team_ids = QueueTeam.objects.filter(
            queue_id__in=user_queue_ids,
        ).values_list('team_id', flat=True)
        qs = qs.filter(Q(team__isnull=True) | Q(team_id__in=list(user_team_ids)))

        # Support filtering by tag
        tag = self.request.query_params.get('tag')
        if tag:
            qs = qs.filter(tags__contains=[tag])

        # Support search by title/content
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(title__icontains=search) | Q(content__icontains=search)
            )

        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.instance
        # Snapshot the current state BEFORE applying changes
        QuickReplyTemplateHistory.objects.create(
            template=instance,
            edited_by=self.request.user,
            title=instance.title,
            content=instance.content,
            rich_body=instance.rich_body,
            tags=instance.tags,
        )
        serializer.save()

    def perform_destroy(self, instance):
        # Soft delete
        instance.is_active = False
        instance.save(update_fields=['is_active'])

    @action(detail=True, methods=['get'], url_path='history')
    def history(self, request, pk=None):
        """Return the edit history for a template (admin/supervisor only)."""
        template = self.get_object()
        qs = template.history.select_related('edited_by').order_by('-edited_at')
        serializer = QuickReplyTemplateHistorySerializer(qs, many=True)
        return Response(serializer.data)


class TicketViewSet(viewsets.ModelViewSet):
    """
    Ticket management for agents.

    - GET    /tickets/                  list (filter: queue, status, assigned_to=me)
    - GET    /tickets/{id}/             retrieve
    - PATCH  /tickets/{id}/             update status/priority/assigned_to
    - POST   /tickets/{id}/claim/       assign to current user, set in_progress
    - POST   /tickets/{id}/close/       set status to closed
    """
    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        qs = Ticket.objects.select_related('queue', 'assigned_to', 'conversation').order_by('-created_at')

        # Staff/superusers see all
        if not (user.is_staff or user.is_superuser):
            # Filter to queues the user has access to
            admin_org_ids = CustomerUser.objects.filter(
                user=user, is_active=True, user_type__in=('supervisor', 'admin')
            ).values_list('organisation_id', flat=True)
            agent_queue_ids = QueueAgent.objects.filter(user=user).values_list('queue_id', flat=True)
            accessible_queue_ids = Queue.objects.filter(
                Q(organisation_id__in=admin_org_ids) | Q(id__in=agent_queue_ids)
            ).values_list('id', flat=True)
            qs = qs.filter(queue_id__in=accessible_queue_ids)

        # Filter params
        queue_id = self.request.query_params.get('queue')
        if queue_id:
            qs = qs.filter(queue_id=queue_id)

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        assigned_to = self.request.query_params.get('assigned_to')
        if assigned_to == 'me':
            qs = qs.filter(assigned_to=user)
        elif assigned_to == 'unassigned':
            qs = qs.filter(assigned_to__isnull=True)
        elif assigned_to:
            qs = qs.filter(assigned_to_id=assigned_to)

        return qs

    @action(detail=True, methods=['post'])
    def claim(self, request, pk=None):
        """Assign ticket to current user and set status to in_progress."""
        ticket = self.get_object()
        ticket.assigned_to = request.user
        if ticket.status == 'todo':
            ticket.status = 'in_progress'
        ticket.save(update_fields=['assigned_to', 'status'])
        return Response(TicketSerializer(ticket).data)

    def partial_update(self, request, *args, **kwargs):
        """Override PATCH to broadcast system message and sync conversation status on resolved."""
        ticket = self.get_object()
        old_status = ticket.status
        new_status = request.data.get('status')

        response = super().partial_update(request, *args, **kwargs)

        if new_status and old_status != new_status and ticket.conversation_id:
            if new_status == 'resolved':
                msg = ConversationMessage.objects.create(
                    conversation_id=ticket.conversation_id,
                    sender_type='system',
                    content=f'Ticket #{ticket.id} has been marked as resolved.',
                )
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f'csm_conversation_{ticket.conversation_id}',
                    {'type': 'conversation.message', 'message': ConversationMessageSerializer(msg).data},
                )
                Conversation.objects.filter(id=ticket.conversation_id).update(status='resolved')

        return response

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Close a ticket."""
        ticket = self.get_object()
        ticket.status = 'closed'
        ticket.save(update_fields=['status'])

        # If linked to a conversation, post a system message and sync status
        if ticket.conversation_id:
            Conversation.objects.filter(id=ticket.conversation_id).update(status='closed')
            msg = ConversationMessage.objects.create(
                conversation_id=ticket.conversation_id,
                sender_type='system',
                content=f'Ticket #{ticket.id} has been closed.',
            )
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f'csm_conversation_{ticket.conversation_id}',
                {'type': 'conversation.message', 'message': ConversationMessageSerializer(msg).data},
            )

        return Response(TicketSerializer(ticket).data)
