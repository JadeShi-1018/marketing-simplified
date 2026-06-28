"""Public support-channel runtime endpoints for portal and widget surfaces."""

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from csm.services.support_channels import (
    build_channel_runtime_config,
    list_active_channels_for_experience_group,
    resolve_active_channel,
)
from experience_group.models import ExperienceGroup


class ChannelRuntimeConfigView(APIView):
    """GET /api/portal/channels/<lookup>/config/"""

    permission_classes = [AllowAny]

    def get(self, request, lookup):
        channel = resolve_active_channel(lookup)
        return Response(build_channel_runtime_config(channel, request))


class ExperienceGroupChannelsView(APIView):
    """GET /api/portal/experience-groups/<eg_id>/channels/"""

    permission_classes = [AllowAny]

    def get(self, request, eg_id):
        try:
            eg = ExperienceGroup.objects.get(pk=eg_id)
        except ExperienceGroup.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if eg.status != ExperienceGroup.PublishStatus.PUBLISHED:
            return Response({'detail': 'Not found.'}, status=404)

        channels = list_active_channels_for_experience_group(eg_id)
        return Response([
            build_channel_runtime_config(channel, request)
            for channel in channels
        ])
