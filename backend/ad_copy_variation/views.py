import uuid

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.models import Project, ProjectMember
from meta_ads.models import MetaAdCreative

from . import services
from .models import AdCopyVariation
from .serializers import AdCopyVariationSerializer


class AdCopyVariationPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            'count': self.page.paginator.count,
            'page': self.page.number,
            'page_size': self.get_page_size(self.request),
            'results': data,
        })


class AdCopyVariationViewSet(viewsets.ModelViewSet):
    queryset = AdCopyVariation.objects.all()
    serializer_class = AdCopyVariationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = AdCopyVariationPagination

    def _parse_int(self, raw):
        if raw is None or raw == '':
            return None
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None

    def _get_accessible_project_ids(self):
        return ProjectMember.objects.filter(
            user=self.request.user,
            is_active=True,
        ).values_list('project_id', flat=True)

    def _require_project(self, raw_project_id):
        project_id = self._parse_int(raw_project_id)
        if not project_id:
            return None, Response(
                {'error': 'project_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project = get_object_or_404(Project, pk=project_id, is_deleted=False)
        if not ProjectMember.objects.filter(
            user=self.request.user,
            project=project,
            is_active=True,
        ).exists():
            return None, Response(
                {'error': 'You are not a member of this project.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return project, None

    def get_queryset(self):
        qs = super().get_queryset().select_related('project', 'creative')
        project_id = self.request.query_params.get('project_id')
        if project_id:
            project, error = self._require_project(project_id)
            if error:
                return AdCopyVariation.objects.none()
            qs = qs.filter(project=project)
        else:
            accessible = self._get_accessible_project_ids()
            qs = qs.filter(Q(project_id__in=accessible) | Q(project__isnull=True))

        creative_id = self.request.query_params.get('creative')
        if creative_id:
            qs = qs.filter(creative_id=creative_id)
        status_param = self.request.query_params.get('status')
        if status_param:
            statuses = [value.strip() for value in status_param.split(',') if value.strip()]
            qs = qs.filter(status__in=statuses)
        source_mode = self.request.query_params.get('source_mode')
        if source_mode:
            qs = qs.filter(source_mode=source_mode)
        qs = qs.order_by('-created_at', '-id')
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        source_mode = request.data.get('source_mode')
        instruction = request.data.get('instruction', '')
        count_raw = request.data.get('count', 1)
        project, project_error = self._require_project(request.data.get('project_id'))
        if project_error:
            return project_error

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

        # Batch path: validate per-mode required fields up front to avoid spawning N futures only to fail each.
        creative = None
        if source_mode == 'existing' and not source_kwargs['creative_id']:
            return Response(
                {'error': 'creative_id required for source_mode=existing'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if source_mode == 'existing':
            creative = get_object_or_404(MetaAdCreative, pk=source_kwargs['creative_id'])
            creative_project_id = getattr(creative.ad_account, 'project_id', None)
            if creative_project_id and creative_project_id != project.id:
                return Response(
                    {'error': 'creative_id does not belong to project_id'},
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

        if count == 1:
            batch_id = str(uuid.uuid4())
            try:
                copy = services._single_generate_dispatch(source_mode, source_kwargs, instruction)
                batch = {
                    'batch_id': batch_id,
                    'count_requested': 1,
                    'count_succeeded': 1,
                    'count_failed': 0,
                    'results': [copy],
                    'failed_indices': [],
                }
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            except Exception:
                batch = {
                    'batch_id': batch_id,
                    'count_requested': 1,
                    'count_succeeded': 0,
                    'count_failed': 1,
                    'results': [],
                    'failed_indices': [0],
                }
        else:
            try:
                batch = services.generate_batch(source_mode, count, source_kwargs, instruction)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            except Exception as exc:
                return Response(
                    {'error': f'Batch generation failed: {exc}'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        saved_rows = self._persist_batch(
            batch=batch,
            project=project,
            source_mode=source_mode,
            creative=creative,
            source_ref=(source_kwargs.get('url') or '').strip() if source_mode == 'external_url' else '',
            instruction=instruction,
        )
        batch['results'] = AdCopyVariationSerializer(
            saved_rows,
            many=True,
            context=self.get_serializer_context(),
        ).data

        if batch['count_succeeded'] == 0:
            return Response(batch, status=status.HTTP_502_BAD_GATEWAY)
        return Response(batch, status=status.HTTP_200_OK)

    def _persist_batch(self, *, batch, project, source_mode, creative, source_ref, instruction):
        rows = []
        for index, copy in enumerate(batch['results']):
            rows.append(AdCopyVariation(
                project=project,
                creative=creative,
                source_mode=source_mode,
                source_ref=source_ref,
                hook=copy.get('hook', ''),
                headline=copy.get('headline', ''),
                description=copy.get('description', ''),
                cta=copy.get('cta', ''),
                instruction=instruction,
                batch_id=batch['batch_id'],
                batch_position=index,
                status=AdCopyVariation.STATUS_DRAFT,
                created_by=self.request.user,
            ))
        AdCopyVariation.objects.bulk_create(rows)
        return list(
            AdCopyVariation.objects.filter(
                project=project,
                batch_id=batch['batch_id'],
            ).order_by('batch_position', 'id')
        )

    @action(detail=False, methods=['post'], url_path='review_batch')
    def review_batch(self, request):
        project, project_error = self._require_project(request.data.get('project_id'))
        if project_error:
            return project_error

        batch_id = request.data.get('batch_id')
        if not batch_id:
            return Response(
                {'error': 'batch_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        selected_ids = request.data.get('selected_ids')
        if not isinstance(selected_ids, list) or len(selected_ids) == 0:
            return Response(
                {'error': 'selected_ids must be a non-empty list'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            selected_ids = [int(item) for item in selected_ids]
        except (TypeError, ValueError):
            return Response(
                {'error': 'selected_ids must contain integers'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            selected_in_batch = set(AdCopyVariation.objects.filter(
                project=project,
                batch_id=batch_id,
                id__in=selected_ids,
            ).values_list('id', flat=True))
            if selected_in_batch != set(selected_ids):
                return Response(
                    {'error': 'selected_ids must all belong to the current project and batch'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            batch_drafts = AdCopyVariation.objects.select_for_update().filter(
                project=project,
                batch_id=batch_id,
                status=AdCopyVariation.STATUS_DRAFT,
            )
            selected_draft_ids = set(batch_drafts.filter(id__in=selected_ids).values_list('id', flat=True))
            if not selected_draft_ids:
                return Response(
                    {'error': 'selected_ids must include at least one draft from this batch'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            reviewed_count = batch_drafts.filter(id__in=selected_ids).update(
                status=AdCopyVariation.STATUS_REVIEWED,
            )

        rows = AdCopyVariation.objects.filter(
            project=project,
            batch_id=batch_id,
        ).order_by('batch_position', 'id')

        return Response(
            {
                'batch_id': batch_id,
                'reviewed_count': reviewed_count,
                'results': AdCopyVariationSerializer(
                    rows,
                    many=True,
                    context=self.get_serializer_context(),
                ).data,
            },
            status=status.HTTP_200_OK,
        )
