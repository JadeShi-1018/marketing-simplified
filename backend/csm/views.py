from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Q, Case, When, IntegerField, Value
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from core.admin_permissions import IsCsmAccessAllowed
from core.permissions import IsProjectMember
from core.viewset_mixins import ProjectScopedViewSetMixin
from core.slug_mixins import SlugLookupViewSetMixin

from .models import (
    Queue, QueueAgent, QueueTeam, CustomerUser, Ticket, CsmNotification,
    Conversation, ConversationMessage, QuickReplyTemplate, QuickReplyTemplateHistory,
    TicketForm, TicketFormAssignment, SupportProject, CsmWorkType,
    SupportChannel, SLAPolicy, SLAPriorityTarget,
)
from .serializers import (
    QueueSerializer, QueueAgentSerializer,
    QueueTeamSerializer, CustomerUserSerializer,
    CsmNotificationSerializer,
    ConversationSerializer, ConversationDetailSerializer,
    ConversationMessageSerializer, TicketSerializer,
    QuickReplyTemplateSerializer, QuickReplyTemplateHistorySerializer,
    TicketFormListSerializer,
    TicketFormDetailSerializer,
    TicketFormCreateSerializer,
    BulkFieldsSerializer,
    TicketFormAssignmentSerializer,
    ReplaceAssignmentsSerializer,
    SupportProjectSerializer,
    CsmWorkTypeSerializer,
    WorkTypeReorderSerializer,
    SLAPolicySerializer,
    SupportChannelListSerializer,
    SupportChannelDetailSerializer,
    SupportChannelCreateUpdateSerializer,
    ReplaceChannelAssignmentsSerializer,
)
from .services import (
    ensure_system_fields,
    set_default_form,
    bulk_update_fields,
    replace_assignments,
    assert_can_delete_form,
)
from .services.support_projects import (
    list_support_projects_for_workspace,
    create_support_project,
    update_support_project,
    archive_support_project,
)
from .services.work_types import (
    list_work_types_for_workspace,
    create_work_type,
    update_work_type,
    deactivate_work_type,
    reorder_work_types,
)
from .services.support_channels import (
    list_channels_for_project,
    channel_detail_queryset,
    create_support_channel,
    update_support_channel,
    deactivate_support_channel,
    replace_experience_group_assignments,
    build_embed_snippet,
)


def _raise_drf_validation(exc):
    raise ValidationError(exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)


class QueueViewSet(SlugLookupViewSetMixin, viewsets.ModelViewSet):
    # Slug-only lookups; numeric path segments return 404.
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



class ConversationPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


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
    pagination_class = ConversationPagination

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
        from csm.services.sla import recalculate_ticket_sla
        recalculate_ticket_sla(ticket)
        if ticket.first_response_due is not None or ticket.resolution_due is not None:
            ticket.save(update_fields=['first_response_due', 'resolution_due'])

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
        if image:
            if not image.content_type.startswith('image/'):
                return Response({'detail': 'File must be an image.'}, status=status.HTTP_400_BAD_REQUEST)
            if image.size > 5 * 1024 * 1024:
                return Response({'detail': 'Image must be under 5MB.'}, status=status.HTTP_400_BAD_REQUEST)
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
        from csm.services.sla import recalculate_ticket_sla
        recalculate_ticket_sla(ticket)
        if ticket.first_response_due is not None or ticket.resolution_due is not None:
            ticket.save(update_fields=['first_response_due', 'resolution_due'])

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

        # Team scoping: show workspace-wide templates (no team) OR templates whose
        # team the user belongs to. In CSM a user's team membership is recorded on
        # CustomerUser.team (core.TeamMember is not populated for CSM agents), so
        # that is the source of truth here.
        user_team_ids = CustomerUser.objects.filter(
            user=self.request.user, is_active=True, team__isnull=False,
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

    Ordering: ?ordering=priority (Critical first) or ?ordering=-priority (Low first).
    Handled in get_queryset() via CASE expression; OrderingFilter is excluded to
    prevent it from interpreting ?ordering=priority as a plain string sort.
    """
    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    filter_backends = [DjangoFilterBackend, SearchFilter]

    def get_queryset(self):
        user = self.request.user
        qs = Ticket.objects.select_related('queue', 'assigned_to', 'conversation')

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

        # Ordering: ?ordering=priority sorts Critical→Low; default newest first
        ordering = self.request.query_params.get('ordering', '')
        if ordering in ('priority', '-priority'):
            qs = qs.annotate(
                _priority_rank=Case(
                    When(priority='critical', then=Value(0)),
                    When(priority='high',     then=Value(1)),
                    When(priority='medium',   then=Value(2)),
                    When(priority='low',      then=Value(3)),
                    default=Value(4),
                    output_field=IntegerField(),
                )
            )
            if ordering == '-priority':
                qs = qs.order_by('-_priority_rank', '-created_at')
            else:
                qs = qs.order_by('_priority_rank', '-created_at')
        else:
            qs = qs.order_by('-created_at')

        return qs

    def perform_create(self, serializer):
        from csm.services.sla import recalculate_ticket_sla
        ticket = serializer.save()
        recalculate_ticket_sla(ticket)
        if ticket.first_response_due is not None or ticket.resolution_due is not None:
            ticket.save(update_fields=['first_response_due', 'resolution_due'])

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
        """Override PATCH to sync SLA on priority change and broadcast status changes."""
        from csm.services.sla import recalculate_ticket_sla
        ticket = self.get_object()
        old_status = ticket.status
        old_priority = ticket.priority
        new_status = request.data.get('status')
        new_priority = request.data.get('priority')

        response = super().partial_update(request, *args, **kwargs)

        # Conversation sync on status change
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

        # Recalculate SLA when priority changes, using now() so the countdown
        # restarts from the moment of the change rather than ticket creation.
        if new_priority and old_priority != new_priority:
            from django.utils import timezone as tz
            ticket.refresh_from_db()
            recalculate_ticket_sla(ticket, base_time=tz.now())
            ticket.save(update_fields=['first_response_due', 'resolution_due'])
            return Response(TicketSerializer(ticket).data)

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


class TicketFormViewSet(SlugLookupViewSetMixin, ProjectScopedViewSetMixin, viewsets.ModelViewSet):
    # Slug-only lookups; numeric path segments return 404.
    """
    Admin ticket form builder API.

    Permissions: IsAuthenticated + IsProjectMember (project-scoped, not CSM admin).
    List/create require ?project={id}.
    """
    permission_classes = [IsAuthenticated, IsProjectMember]
    http_method_names = ['get', 'post', 'patch', 'put', 'delete']

    def get_queryset(self):
        qs = TicketForm.objects.filter(is_active=True).annotate(
            assignment_count=Count('assignments'),
        ).prefetch_related('fields')
        if self.action == 'list':
            project_id = self.get_required_project_id()
            return qs.filter(project_id=project_id)
        return self.filter_by_accessible_projects(qs)

    def get_serializer_class(self):
        if self.action == 'list':
            return TicketFormListSerializer
        if self.action == 'create':
            return TicketFormCreateSerializer
        if self.action == 'bulk_fields':
            return BulkFieldsSerializer
        return TicketFormDetailSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        form = self.get_queryset().get(pk=serializer.instance.pk)
        return Response(
            TicketFormDetailSerializer(form).data,
            status=status.HTTP_201_CREATED,
        )

    def perform_create(self, serializer):
        project_id = self.get_required_project_id()
        form = serializer.save(
            project_id=project_id,
            created_by=self.request.user,
        )
        ensure_system_fields(form)

    def perform_destroy(self, instance):
        assert_can_delete_form(instance)
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])

    @action(detail=True, methods=['put'], url_path='fields')
    def bulk_fields(self, request, pk=None):
        form = self.get_object()
        serializer = BulkFieldsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            bulk_update_fields(form, serializer.validated_data['fields'])
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)
        form = self.get_queryset().get(pk=form.pk)
        return Response(TicketFormDetailSerializer(form).data)

    @action(detail=True, methods=['post'], url_path='set-default')
    def set_default(self, request, pk=None):
        form = self.get_object()
        set_default_form(form)
        form = self.get_queryset().get(pk=form.pk)
        return Response(TicketFormDetailSerializer(form).data)

    @action(detail=True, methods=['get', 'put'], url_path='assignments')
    def assignments(self, request, pk=None):
        form = self.get_object()
        if request.method == 'GET':
            qs = TicketFormAssignment.objects.filter(form=form).select_related(
                'experience_group', 'support_project',
            )
            return Response(TicketFormAssignmentSerializer(qs, many=True).data)

        serializer = ReplaceAssignmentsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            replace_assignments(
                form,
                experience_group_ids=serializer.validated_data.get('experience_group_ids', []),
                support_project_ids=serializer.validated_data.get('support_project_ids', []),
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)

        qs = TicketFormAssignment.objects.filter(form=form).select_related(
            'experience_group', 'support_project',
        )
        return Response(TicketFormAssignmentSerializer(qs, many=True).data)


class SupportProjectViewSet(ProjectScopedViewSetMixin, viewsets.ModelViewSet):
    """
    Support project CRUD (CSM-S01-08).

    List/create require ?project={id}. DELETE soft-archives the row.
    """
    serializer_class = SupportProjectSerializer
    permission_classes = [IsAuthenticated, IsProjectMember]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = SupportProject.objects.select_related('default_queue')
        if self.action == 'list':
            project_id = self.get_required_project_id()
            include_archived = self.request.query_params.get('include_archived') in (
                '1', 'true', 'True',
            )
            return list_support_projects_for_workspace(
                project_id,
                include_archived=include_archived,
            )
        return self.filter_by_accessible_projects(qs)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        default_queue = data.get('default_queue')
        try:
            instance = create_support_project(
                project_id=self.get_required_project_id(),
                name=data['name'],
                default_queue_id=default_queue.pk if default_queue else None,
            )
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        instance = self.get_queryset().model.objects.select_related(
            'default_queue',
        ).get(pk=instance.pk)
        return Response(
            SupportProjectSerializer(instance).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        kwargs_update = {}
        if 'name' in data:
            kwargs_update['name'] = data['name']
        if 'default_queue' in data:
            queue = data['default_queue']
            kwargs_update['default_queue_id'] = queue.pk if queue else None
        if 'is_archived' in data:
            kwargs_update['is_archived'] = data['is_archived']
        try:
            instance = update_support_project(instance, **kwargs_update)
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        instance = SupportProject.objects.select_related('default_queue').get(pk=instance.pk)
        return Response(SupportProjectSerializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            instance = archive_support_project(instance)
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        instance = SupportProject.objects.select_related('default_queue').get(pk=instance.pk)
        return Response(SupportProjectSerializer(instance).data)


class CsmWorkTypeViewSet(ProjectScopedViewSetMixin, viewsets.ModelViewSet):
    """
    Work type CRUD (CSM-S01-08).

    List/create require ?project={id}. DELETE deactivates the row.
    """
    serializer_class = CsmWorkTypeSerializer
    permission_classes = [IsAuthenticated, IsProjectMember]
    http_method_names = ['get', 'post', 'patch', 'put', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = CsmWorkType.objects.all()
        if self.action == 'list':
            project_id = self.get_required_project_id()
            include_inactive = self.request.query_params.get('include_inactive') in (
                '1', 'true', 'True',
            )
            return list_work_types_for_workspace(
                project_id,
                include_inactive=include_inactive,
            )
        return self.filter_by_accessible_projects(qs)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            instance = create_work_type(
                project_id=self.get_required_project_id(),
                name=data['name'],
                sort_order=data.get('sort_order'),
            )
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(
            CsmWorkTypeSerializer(instance).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        kwargs_update = {key: data[key] for key in ('name', 'sort_order', 'is_active') if key in data}
        try:
            instance = update_work_type(instance, **kwargs_update)
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(CsmWorkTypeSerializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            instance = deactivate_work_type(instance)
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(CsmWorkTypeSerializer(instance).data)

    @action(detail=False, methods=['put'], url_path='reorder')
    def reorder(self, request):
        project_id = self.get_required_project_id()
        serializer = WorkTypeReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            rows = reorder_work_types(project_id, serializer.validated_data['ids'])
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(CsmWorkTypeSerializer(rows, many=True).data)


class SupportChannelViewSet(ProjectScopedViewSetMixin, viewsets.ModelViewSet):
    """
    Support channel CRUD (CSM-S01-02).

    List/create require ?project={id}. DELETE soft-deactivates the row.
    """
    permission_classes = [IsAuthenticated, IsProjectMember]
    http_method_names = ['get', 'post', 'patch', 'delete', 'put', 'head', 'options']

    def get_queryset(self):
        if self.action == 'list':
            project_id = self.get_required_project_id()
            include_inactive = self.request.query_params.get('include_inactive') in (
                '1', 'true', 'True',
            )
            return list_channels_for_project(
                project_id,
                include_inactive=include_inactive,
            )
        return self.filter_by_accessible_projects(channel_detail_queryset())

    def get_serializer_class(self):
        if self.action == 'list':
            return SupportChannelListSerializer
        if self.action in ('create', 'partial_update', 'update'):
            return SupportChannelCreateUpdateSerializer
        return SupportChannelDetailSerializer

    def _service_kwargs(self, data):
        kwargs = {}
        for key in (
            'channel_type', 'display_name', 'welcome_message', 'operating_hours',
            'timezone', 'offline_fallback_message', 'offline_alternative',
            'offline_alternative_target_id', 'email_address', 'sort_order', 'is_active',
        ):
            if key in data:
                kwargs[key] = data[key]
        if 'default_queue' in data:
            kwargs['default_queue'] = data['default_queue']
        if 'ticket_form' in data:
            kwargs['ticket_form'] = data['ticket_form']
        return kwargs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            extra_kwargs = {
                k: v for k, v in self._service_kwargs(data).items()
                if k not in ('channel_type', 'display_name')
            }
            instance = create_support_channel(
                project_id=self.get_required_project_id(),
                channel_type=data['channel_type'],
                display_name=data['display_name'],
                **extra_kwargs,
            )
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        instance = channel_detail_queryset().get(pk=instance.pk)
        return Response(
            SupportChannelDetailSerializer(instance).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            instance = update_support_channel(
                instance,
                **self._service_kwargs(serializer.validated_data),
            )
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        instance = channel_detail_queryset().get(pk=instance.pk)
        return Response(SupportChannelDetailSerializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        deactivate_support_channel(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['put'], url_path='experience-groups')
    def experience_groups(self, request, pk=None):
        channel = self.get_object()
        serializer = ReplaceChannelAssignmentsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            groups = replace_experience_group_assignments(
                channel,
                serializer.validated_data.get('experience_group_ids', []),
            )
        except DjangoValidationError as exc:
            _raise_drf_validation(exc)
        return Response(groups)

    @action(detail=True, methods=['get'], url_path='embed-snippet')
    def embed_snippet(self, request, pk=None):
        channel = self.get_object()
        if channel.channel_type != SupportChannel.ChannelType.LIVE_CHAT:
            raise ValidationError({
                'detail': 'Embed snippet is only available for live chat channels.',
            })
        snippet = build_embed_snippet(
            channel,
            base_url=request.build_absolute_uri('/'),
        )
        return Response({
            'snippet': snippet,
            'embed_key': str(channel.embed_key),
        })


# ---------------------------------------------------------------------------
# SLA Policy (MED-218)
# ---------------------------------------------------------------------------

_SLA_DEFAULT_TARGETS = [
    ('critical', 60,   240),   # 1h first response, 4h resolution
    ('high',     240,  480),   # 4h / 8h
    ('medium',   480,  1440),  # 8h / 24h
    ('low',      1440, 2880),  # 24h / 48h
]


class SLAPolicyViewSet(ProjectScopedViewSetMixin, viewsets.ModelViewSet):
    """
    SLA Policy admin API (MED-218).

    - GET   /sla-policy/?project={id}  retrieve the project's SLA policy
    - PUT   /sla-policy/{id}/          full update (replaces all priority targets)
    - PATCH /sla-policy/{id}/          partial update
    """
    serializer_class = SLAPolicySerializer
    permission_classes = [IsAuthenticated, IsCsmAccessAllowed]
    http_method_names = ['get', 'put', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = SLAPolicy.objects.prefetch_related('priority_targets').select_related('project')
        return self.filter_by_accessible_projects(qs)

    def list(self, request, *args, **kwargs):
        """Return (or lazily create) the project's SLA policy."""
        project_id = self.get_required_project_id()
        policy, created = SLAPolicy.objects.get_or_create(
            project_id=project_id,
            defaults={'name': 'Default SLA Policy'},
        )
        if created or not policy.priority_targets.exists():
            existing_priorities = set(
                policy.priority_targets.values_list('priority', flat=True)
            )
            for priority, fr, res in _SLA_DEFAULT_TARGETS:
                if priority not in existing_priorities:
                    SLAPriorityTarget.objects.create(
                        policy=policy,
                        priority=priority,
                        first_response_minutes=fr,
                        resolution_minutes=res,
                    )
            policy.refresh_from_db()
        return Response(SLAPolicySerializer(policy).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        was_active = instance.is_active
        old_targets_by_priority = {
            t.priority: (t.first_response_minutes, t.resolution_minutes)
            for t in instance.priority_targets.all()
        }
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        instance.refresh_from_db()
        policy_reactivated = not was_active and instance.is_active

        from csm.services.sla import recalculate_ticket_sla_after_policy_change
        project_id = instance.project_id
        open_tickets = list(
            Ticket.objects
            .filter(queue__project_id=project_id, status__in=('todo', 'in_progress'))
            .select_related('queue__project')
        )
        for ticket in open_tickets:
            recalculate_ticket_sla_after_policy_change(
                ticket,
                old_targets_by_priority,
                policy_reactivated=policy_reactivated,
            )
        if open_tickets:
            Ticket.objects.bulk_update(open_tickets, ['first_response_due', 'resolution_due'])

        return Response(serializer.data)
