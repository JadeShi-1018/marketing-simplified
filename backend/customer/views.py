from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import IsProjectMember
from core.viewset_mixins import ProjectScopedViewSetMixin

from .models import Customer, Region, CustomerOrganisation
from .serializers import CustomerSerializer, RegionSerializer,CustomerOrganisationSerializer


class RegionViewSet(ProjectScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = Region.objects.all()
    serializer_class = RegionSerializer
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.action in ('list', 'create'):
            context['project_id'] = self.get_required_project_id()
        return context

    def get_queryset(self):
        if self.action == 'list':
            project_id = self.get_required_project_id()
            return Region.objects.filter(project_id=project_id)
        return self.filter_by_accessible_projects(Region.objects.all())

    def perform_create(self, serializer):
        project_id = self.get_required_project_id()
        serializer.save(project_id=project_id)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        customer_count = instance.customers.count()
        org_count = instance.organisations.count()
        if customer_count > 0 or org_count > 0:
            return Response(
                {
                    'detail': (
                        f'Cannot delete: {customer_count} customer(s) and '
                        f'{org_count} organisation(s) are using this region. '
                        'Reassign them first.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class CustomerOrganisationViewSet(ProjectScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = CustomerOrganisation.objects.all()
    serializer_class = CustomerOrganisationSerializer
    permission_classes = [IsAuthenticated, IsProjectMember]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.action in ('list', 'create'):
            context['project_id'] = self.get_required_project_id()
        return context

    def get_queryset(self):
        if self.action == 'list':
            project_id = self.get_required_project_id()
            return CustomerOrganisation.objects.filter(project_id=project_id)
        return self.filter_by_accessible_projects(CustomerOrganisation.objects.all())

    def perform_create(self, serializer):
        project_id = self.get_required_project_id()
        serializer.save(project_id=project_id)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
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
    permission_classes = [IsAuthenticated, IsProjectMember]

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