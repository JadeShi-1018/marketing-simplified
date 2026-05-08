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
        count_raw = request.data.get('count', 1)

        try:
            count = int(count_raw)
        except (TypeError, ValueError):
            return Response(
                {'error': 'count must be an integer'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if count < 1 or count > services.MAX_BATCH:
            return Response(
                {'error': f'count must be between 1 and {services.MAX_BATCH}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if source_mode not in ('existing', 'custom', 'external_url'):
            return Response(
                {'error': f'unknown source_mode: {source_mode}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_kwargs = {
            'creative_id': request.data.get('creative_id'),
            'base_copy': request.data.get('base_copy'),
            'url': request.data.get('url'),
        }

        if count == 1:
            return self._dispatch_single(source_mode, source_kwargs, instruction)

        # Batch path: validate per-mode required fields up front to avoid spawning N futures only to fail each.
        if source_mode == 'existing' and not source_kwargs['creative_id']:
            return Response(
                {'error': 'creative_id required for source_mode=existing'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if source_mode == 'external_url':
            url = (source_kwargs['url'] or '').strip()
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
            batch = services.generate_batch(source_mode, count, source_kwargs, instruction)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response(
                {'error': f'Batch generation failed: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if batch['count_succeeded'] == 0:
            return Response(batch, status=status.HTTP_502_BAD_GATEWAY)
        return Response(batch, status=status.HTTP_200_OK)

    def _dispatch_single(self, source_mode, source_kwargs, instruction):
        if source_mode == 'existing':
            creative_id = source_kwargs['creative_id']
            if not creative_id:
                return Response(
                    {'error': 'creative_id required for source_mode=existing'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                copy = services.generate_from_existing(int(creative_id), instruction)
            except Exception as exc:
                return Response(
                    {'error': f'Generation failed: {exc}'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            return Response(copy, status=status.HTTP_200_OK)

        if source_mode == 'custom':
            base_copy = source_kwargs['base_copy'] or {}
            try:
                copy = services.generate_from_custom(base_copy, instruction)
            except Exception as exc:
                return Response(
                    {'error': f'Generation failed: {exc}'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            return Response(copy, status=status.HTTP_200_OK)

        if source_mode == 'external_url':
            url = (source_kwargs['url'] or '').strip()
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
