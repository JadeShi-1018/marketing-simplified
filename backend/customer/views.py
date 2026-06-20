from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from core.admin_permissions import IsCsmAccessAllowed
from core.viewset_mixins import ProjectScopedViewSetMixin

from .models import (
    Customer, Region, CustomerOrganisation, CustomerStatusLabel,
    CustomerInternalNote, CustomerInternalNoteAuditLog
)
from .serializers import (
    CustomerSerializer, RegionSerializer, CustomerOrganisationSerializer,
    CustomerStatusLabelSerializer, CustomerInternalNoteSerializer,
    CustomerInternalNoteAuditLogSerializer
)


class RegionViewSet(viewsets.ModelViewSet):
    queryset = Region.objects.all()
    serializer_class = RegionSerializer
    permission_classes = [IsAuthenticated, IsCsmAccessAllowed]

    def get_queryset(self):
        from core.admin_utils import get_csm_admin_org_ids
        user = self.request.user
        qs = Region.objects.all()

        org_id = self.request.query_params.get('organisation')
        if org_id:
            qs = qs.filter(organisation_id=org_id)

        admin_org_ids = get_csm_admin_org_ids(user)
        return qs.filter(organisation_id__in=admin_org_ids)

    def perform_create(self, serializer):
        from core.admin_utils import get_csm_admin_org_ids
        org_id = self.request.data.get('organisation')
        if not org_id:
            admin_org_ids = get_csm_admin_org_ids(self.request.user)
            if admin_org_ids:
                org_id = admin_org_ids[0]
        serializer.save(organisation_id=org_id)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        customer_count = instance.customers.count()
        if customer_count > 0:
            return Response(
                {
                    'detail': (
                        f'Cannot delete: {customer_count} customer(s) are using this region. '
                        'Reassign them first.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class CustomerOrganisationViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerOrganisationSerializer

    def get_permissions(self):
        if self.action in ('create', 'list', 'my_admin_orgs'):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsCsmAccessAllowed()]

    def get_queryset(self):
        from core.admin_utils import get_csm_admin_org_ids
        user = self.request.user
        admin_org_ids = get_csm_admin_org_ids(user)
        return CustomerOrganisation.objects.filter(id__in=admin_org_ids)

    @action(detail=False, methods=['get'], url_path='my-admin-orgs')
    def my_admin_orgs(self, request):
        """Return organisations where current user is CSM admin."""
        from core.admin_utils import get_csm_admin_org_ids
        admin_org_ids = get_csm_admin_org_ids(request.user)
        orgs = CustomerOrganisation.objects.filter(id__in=admin_org_ids)
        data = [{'id': o.id, 'name': o.name} for o in orgs.order_by('name')]
        return Response(data)

    def perform_create(self, serializer):
        """Any authenticated user can create an org; auto-assign as admin creator."""
        from csm.models import CustomerUser
        org = serializer.save()
        CustomerUser.objects.create(
            user=self.request.user,
            organisation=org,
            user_type='admin',
            is_active=True,
            is_creator=True,
        )

    def destroy(self, request, *args, **kwargs):
        from core.admin_utils import get_csm_admin_org_ids
        instance = self.get_object()
        admin_org_ids = get_csm_admin_org_ids(request.user)
        if instance.id not in admin_org_ids:
            return Response(
                {'detail': 'You do not have permission to delete this organisation.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        customer_count = instance.customers.count()
        if customer_count > 0:
            return Response(
                {
                    'detail': (
                        f'Cannot delete: {customer_count} customer(s) belong to this organisation. '
                        'Reassign them first.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class CustomerViewSet(ProjectScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = Customer.objects.select_related('experience_group').all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.action in ('list', 'create'):
            context['project_id'] = self.get_required_project_id()
        return context

    def get_queryset(self):
        base = Customer.objects.select_related('experience_group')
        if self.action == 'list':
            project_id = self.get_required_project_id()
            return base.filter(project_id=project_id)
        return self.filter_by_accessible_projects(base)

    def perform_create(self, serializer):
        project_id = self.get_required_project_id()
        serializer.save(project_id=project_id)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomerStatusLabelViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerStatusLabelSerializer
    permission_classes = [IsAuthenticated, IsCsmAccessAllowed]

    def get_queryset(self):
        from core.admin_utils import get_csm_admin_org_ids
        queryset = CustomerStatusLabel.objects.filter(is_active=True)
        admin_org_ids = get_csm_admin_org_ids(self.request.user)
        return queryset.filter(organisation_id__in=admin_org_ids).order_by('order', 'name')

    def destroy(self, request, *args, **kwargs):
        """Delete label — check if it's in use by customers"""
        instance = self.get_object()
        customer_count = instance.customers.count()
        if customer_count > 0:
            return Response(
                {
                    'detail': (
                        f'Cannot delete: {customer_count} customer(s) use this label. '
                        'Reassign them first.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomerInternalNoteViewSet(viewsets.ModelViewSet):
    """Internal notes on customer profiles — never visible to customers"""
    serializer_class = CustomerInternalNoteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CustomerInternalNote.objects.select_related('author', 'customer')

    def perform_create(self, serializer):
        """Automatically set author to current user"""
        note = serializer.save(author=self.request.user)
        self._record_audit('note.created', note)

    def perform_update(self, serializer):
        """Mark as edited and record audit log"""
        note = serializer.save(is_edited=True)
        self._record_audit('note.edited', note)

    def perform_destroy(self, instance):
        """Record deletion to audit log before deleting"""
        # Check permissions: author can delete own notes, admin can delete any
        if instance.author != self.request.user:
            from core.admin_utils import is_csm_admin
            if not is_csm_admin(self.request.user):
                raise PermissionDenied(
                    "You can only delete your own notes. Contact admin to delete others' notes."
                )

        self._record_audit('note.deleted', instance)
        instance.delete()

    def _record_audit(self, event_type, note):
        """Record audit log entry"""
        CustomerInternalNoteAuditLog.objects.create(
            customer=note.customer,
            actor=self.request.user,
            event_type=event_type,
            note_id=note.id,
            note_body=note.body[:500] if note.body else None,
        )


class CustomerInternalNoteAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only audit log for internal note changes"""
    serializer_class = CustomerInternalNoteAuditLogSerializer
    permission_classes = [IsAuthenticated, IsCsmAccessAllowed]

    def get_queryset(self):
        from core.admin_utils import get_csm_admin_org_ids
        queryset = CustomerInternalNoteAuditLog.objects.all()
        admin_org_ids = get_csm_admin_org_ids(self.request.user)
        # Filter to customers where user is CSM admin
        return queryset.filter(customer__organisation_id__in=admin_org_ids)