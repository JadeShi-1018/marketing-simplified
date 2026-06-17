from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Q

from core.admin_permissions import IsCsmAccessAllowed
from core.permissions import IsProjectMember
from core.viewset_mixins import ProjectScopedViewSetMixin

from .models import (
    Queue, QueueAgent, QueueTeam, CustomerUser, Ticket, CsmNotification,
    TicketForm, TicketFormAssignment, SupportProject, CsmWorkType,
)
from .serializers import (
    QueueSerializer, QueueAgentSerializer,
    QueueTeamSerializer, CustomerUserSerializer,
    CsmNotificationSerializer,
    TicketFormListSerializer,
    TicketFormDetailSerializer,
    TicketFormCreateSerializer,
    BulkFieldsSerializer,
    TicketFormAssignmentSerializer,
    ReplaceAssignmentsSerializer,
    SupportProjectSerializer,
    CsmWorkTypeSerializer,
    WorkTypeReorderSerializer,
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


def _raise_drf_validation(exc):
    raise ValidationError(exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)


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


class TicketFormViewSet(ProjectScopedViewSetMixin, viewsets.ModelViewSet):
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
