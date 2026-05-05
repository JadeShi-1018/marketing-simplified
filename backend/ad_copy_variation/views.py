from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import services
from .models import AdCopyVariation
from .serializers import AdCopyVariationSerializer


class AdCopyVariationViewSet(viewsets.ModelViewSet):
    queryset = AdCopyVariation.objects.all()
    serializer_class = AdCopyVariationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        creative_id = self.request.query_params.get('creative')
        if creative_id:
            qs = qs.filter(creative_id=creative_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        source_mode = request.data.get('source_mode')
        instruction = request.data.get('instruction', '')

        if source_mode == 'existing':
            creative_id = request.data.get('creative_id')
            if not creative_id:
                return Response(
                    {'error': 'creative_id required for source_mode=existing'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            copy = services.generate_from_existing(int(creative_id), instruction)
            return Response(copy, status=status.HTTP_200_OK)

        if source_mode == 'custom':
            base_copy = request.data.get('base_copy', {})
            copy = services.generate_from_custom(base_copy, instruction)
            return Response(copy, status=status.HTTP_200_OK)

        if source_mode == 'external_url':
            url = (request.data.get('url') or '').strip()
            if not url:
                return Response(
                    {'error': 'url required for source_mode=external_url'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not (url.startswith('http://') or url.startswith('https://')):
                return Response(
                    {'error': 'url must be http or https'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                copy = services.generate_from_external_url(url, instruction)
            except Exception as exc:
                return Response(
                    {'error': f'External URL fetch or generation failed: {exc}'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            return Response(copy, status=status.HTTP_200_OK)

        return Response(
            {'error': f'unknown source_mode: {source_mode}'},
            status=status.HTTP_400_BAD_REQUEST,
        )
