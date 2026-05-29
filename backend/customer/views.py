from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.admin_permissions import IsCsmAccessAllowed
from core.viewset_mixins import ProjectScopedViewSetMixin

from .models import Customer, Region, CustomerOrganisation
from .serializers import CustomerSerializer, RegionSerializer, CustomerOrganisationSerializer


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
        serializer.save()

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