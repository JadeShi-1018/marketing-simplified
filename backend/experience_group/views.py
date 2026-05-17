# experience_group/views.py

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django_fsm import TransitionNotAllowed

from .models import ExperienceGroup
from .serializers import ExperienceGroupSerializer, ExperienceGroupListSerializer


class ExperienceGroupViewSet(viewsets.ModelViewSet):
    queryset = ExperienceGroup.objects.all()
    serializer_class = ExperienceGroupSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return ExperienceGroupListSerializer
        return ExperienceGroupSerializer

    def perform_create(self, serializer):
        # Automatically record the creator when creating
        serializer.save(created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()

        # If the group is currently published, editing it reverts it to DRAFT.
        # This ensures customers always see the last explicitly published version
        # until the admin re-publishes.
        if instance.status == ExperienceGroup.PublishStatus.PUBLISHED:
            instance.revert_to_draft()

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if getattr(instance, '_prefetched_objects_cache', None):
            instance._prefetched_objects_cache = {}

        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        # Guard: refuse deletion if customers are assigned to this group
        customer_count = instance.customers.count()
        if customer_count > 0:
            return Response(
                {'detail': f'Cannot delete: {customer_count} customer(s) are assigned to this group. Reassign them first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # TODO: Once Channel and RoutingRule models are implemented, also guard against active channel/routing references.
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """
        Publish Experience Group.
        Merge the content in draft_snapshot into the main field, then trigger FSM transition.
        """
        instance = self.get_object()

        # If there is a draft snapshot, first write the snapshot content into the main field
        if instance.draft_snapshot:
            snapshot = instance.draft_snapshot
            allowed_fields = ['name', 'description']
            for field in allowed_fields:
                if field in snapshot:
                    setattr(instance, field, snapshot[field])

        try:
            instance.publish()  # FSM transition
        except TransitionNotAllowed:
            return Response(
                {'detail': 'This group cannot be published in its current state.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance.save()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        """
        Return the configuration data for preview.
        Merge the published version and draft snapshot, return the result of "what it will look like if published now".
        """
        instance = self.get_object()

        # Basic data: current main field (published or initial draft)
        preview_data = ExperienceGroupSerializer(instance).data

        # Use draft snapshot to overwrite: make the preview reflect the latest saved draft content
        if instance.draft_snapshot:
            for key, value in instance.draft_snapshot.items():
                if key in preview_data:
                    preview_data[key] = value

        preview_data['is_preview'] = True
        return Response(preview_data)