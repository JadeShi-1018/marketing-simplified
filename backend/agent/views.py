import json
import logging
import os

from django.conf import settings as django_settings
from django.db.models import Max, Q, OuterRef, Prefetch, Subquery
from django.http import StreamingHttpResponse
from django.utils.translation import activate as activate_language
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView


class EventStreamRenderer(BaseRenderer):
    """Renderer that accepts text/event-stream for SSE endpoints."""
    media_type = 'text/event-stream'
    format = 'event-stream'
    charset = 'utf-8'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        # Error responses (DRF Response) fall through here; serialize as JSON.
        if data is None:
            return b''
        return json.dumps(data).encode('utf-8')

from core.models import Project, ProjectMember
from spreadsheet.models import Spreadsheet
from .models import (
    AgentSession, AgentMessage, AgentWorkflowDefinition,
    AgentWorkflowStep, AgentWorkflowRun, AgentStepExecution,
    AgentWorkflowTemplate, AgentProjectWorkflowBinding,
)
from .serializers import (
    AgentSessionListSerializer,
    AgentSessionDetailSerializer,
    ChatInputSerializer,
    AgentWorkflowDefinitionListSerializer,
    AgentWorkflowDefinitionDetailSerializer,
    AgentWorkflowStepSerializer,
    AgentStepExecutionSerializer,
    AgentWorkflowRunSerializer,
    StepReorderSerializer,
    AgentWorkflowTemplateSerializer,
    AgentProjectWorkflowBindingSerializer,
    AgentProjectWorkflowBindingListSerializer,
)
from .services import AgentOrchestrator
from . import data_service

logger = logging.getLogger(__name__)


class EnglishResponseMixin:
    """Force English for DRF validation messages in all agent views."""
    def initial(self, request, *args, **kwargs):
        activate_language('en')
        super().initial(request, *args, **kwargs)


def _get_user_project(request):
    """Get the active project for the current user, with membership check."""
    project_id = request.headers.get('X-Project-Id') or request.query_params.get('project_id')
    if project_id:
        try:
            project = Project.objects.get(id=project_id, is_deleted=False)
            if not ProjectMember.objects.filter(project=project, user=request.user).exists():
                return None
            return project
        except Project.DoesNotExist:
            return None
    return getattr(request.user, 'active_project', None)


class AgentSessionViewSet(EnglishResponseMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'list':
            return AgentSessionListSerializer
        return AgentSessionDetailSerializer

    def get_queryset(self):
        project = _get_user_project(self.request)
        qs = AgentSession.objects.filter(
            user=self.request.user,
            is_deleted=False,
        )
        if project:
            qs = qs.filter(project=project)
        search = (self.request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(title__icontains=search)
        qs = qs.order_by('-is_pinned', '-created_at')
        if self.action == 'list':
            last_assistant_sub = AgentMessage.objects.filter(
                session_id=OuterRef('pk'),
                role='assistant',
                is_deleted=False,
            ).order_by('-created_at').values('created_at')[:1]
            qs = qs.annotate(_last_assistant_at=Subquery(last_assistant_sub))
            return qs[:50]
        if self.action == 'retrieve':
            qs = qs.prefetch_related(
                Prefetch(
                    'messages',
                    queryset=AgentMessage.objects.filter(is_deleted=False).order_by('created_at'),
                )
            )
        return qs

    def perform_create(self, serializer):
        project = _get_user_project(self.request)
        if not project:
            project_id = self.request.data.get('project_id')
            if project_id:
                project = Project.objects.get(id=project_id, is_deleted=False)
        serializer.save(user=self.request.user, project=project)

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save()


class ChatView(EnglishResponseMixin, APIView):
    permission_classes = [IsAuthenticated]
    renderer_classes = [EventStreamRenderer, JSONRenderer]

    def post(self, request, session_id):
        serializer = ChatInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            session = AgentSession.objects.get(
                id=session_id,
                user=request.user,
                is_deleted=False,
            )
        except AgentSession.DoesNotExist:
            return Response(
                {"detail": "Session not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        message_text = serializer.validated_data['message']
        spreadsheet_id = serializer.validated_data.get('spreadsheet_id')
        csv_filename = serializer.validated_data.get('csv_filename')
        file_id = serializer.validated_data.get('file_id')
        action = serializer.validated_data.get('action')
        calendar_context = serializer.validated_data.get('calendar_context')
        workflow_id = serializer.validated_data.get('workflow_id')
        column_mapping = serializer.validated_data.get('column_mapping')
        approval_id = serializer.validated_data.get('approval_id')
        approval_decision = serializer.validated_data.get('approval_decision')
        approval_draft = serializer.validated_data.get('approval_draft')

        should_persist_user_message = action not in {
            'start_follow_up', 'cancel_follow_up',
            'create_tasks', 'generate_miro',
            'distribute_message', 'confirm_columns',
            'resume_workflow',
            'resolve_external_approval',
        }

        # Auto-generate title from first real user message
        if should_persist_user_message and not session.title and message_text:
            session.title = message_text[:100]
            session.save(update_fields=['title'])

        if should_persist_user_message:
            AgentMessage.objects.create(
                session=session,
                role='user',
                content=message_text,
                metadata={
                    'spreadsheet_id': spreadsheet_id,
                    'action': action,
                },
            )

        project = session.project
        orchestrator = AgentOrchestrator(
            user=request.user,
            project=project,
            session=session,
        )

        def event_stream():
            assistant_content_parts = []
            assistant_metadata = {}
            last_message_type = 'text'

            def _flush_message():
                """Save accumulated content as an assistant message and reset state."""
                nonlocal assistant_content_parts, assistant_metadata, last_message_type
                body = '\n'.join(p for p in assistant_content_parts if p)
                if body:
                    AgentMessage.objects.create(
                        session=session,
                        role='assistant',
                        content=body,
                        message_type=last_message_type,
                        metadata=assistant_metadata,
                    )
                assistant_content_parts = []
                assistant_metadata = {}
                last_message_type = 'text'

            try:
                for chunk in orchestrator.handle_message(
                    message_text,
                    spreadsheet_id=spreadsheet_id,
                    csv_filename=csv_filename,
                    action=action,
                    file_id=file_id,
                    calendar_context=calendar_context,
                    workflow_id=workflow_id,
                    column_mapping=column_mapping,
                    approval_id=approval_id,
                    approval_decision=approval_decision,
                    approval_draft=approval_draft,
                ):
                    chunk_type = chunk.get('type', 'text')
                    content = chunk.get('content', '')
                    data = chunk.get('data')

                    # Save calendar_invite as a separate message so it can be
                    # restored independently from the preceding calendar answer.
                    if chunk_type == 'calendar_invite':
                        _flush_message()
                        sse_data = json.dumps(chunk, default=str)
                        yield f"data: {sse_data}\n\n"
                        if content:
                            AgentMessage.objects.create(
                                session=session,
                                role='assistant',
                                content=content,
                                message_type='calendar_invite',
                                metadata={},
                            )
                        continue

                    if chunk_type == 'approval_request':
                        _flush_message()
                        sse_data = json.dumps(chunk, default=str)
                        yield f"data: {sse_data}\n\n"
                        AgentMessage.objects.create(
                            session=session,
                            role='assistant',
                            content=content or 'Approval required.',
                            message_type='approval_request',
                            metadata=data or {},
                        )
                        continue

                    if chunk_type == 'workflow_confirm':
                        _flush_message()
                        sse_data = json.dumps(chunk, default=str)
                        yield f"data: {sse_data}\n\n"
                        if content:
                            AgentMessage.objects.create(
                                session=session,
                                role='assistant',
                                content=content,
                                message_type='workflow_confirm',
                                metadata=data or {},
                            )
                        continue

                    if chunk_type == 'confirmation_request':
                        _flush_message()
                        sse_data = json.dumps(chunk, default=str)
                        yield f"data: {sse_data}\n\n"
                        if content:
                            AgentMessage.objects.create(
                                session=session,
                                role='assistant',
                                content=content,
                                message_type='confirmation_request',
                                metadata=data or {},
                            )
                        continue

                    # Miro status is persisted separately (_create_agent_status_message in the
                    # orchestrator). Do not merge its text into the prior assistant bubble or
                    # the final flush — that would duplicate the same line in chat history.
                    if chunk_type == 'miro_status':
                        _flush_message()
                        sse_data = json.dumps(chunk, default=str)
                        yield f"data: {sse_data}\n\n"
                        continue

                    # Skip internal signalling events from content accumulation
                    if chunk_type not in ('done', 'calendar_updated'):
                        if content:
                            assistant_content_parts.append(content)
                        last_message_type = chunk_type
                        if data:
                            assistant_metadata.update(data)

                    sse_data = json.dumps(chunk, default=str)
                    yield f"data: {sse_data}\n\n"

                    if chunk_type == 'done':
                        _flush_message()
            except Exception:
                logger.exception("Error during agent SSE stream")
                _flush_message()
                error_payload = json.dumps({
                    "type": "error",
                    "content": "An internal error occurred. Please try again.",
                })
                yield f"data: {error_payload}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

        response = StreamingHttpResponse(
            event_stream(),
            content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response


class SpreadsheetListView(EnglishResponseMixin, APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        project = _get_user_project(request)
        if not project:
            return Response(
                {"detail": "No active project."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        spreadsheets = Spreadsheet.objects.filter(
            project=project,
            is_deleted=False,
        ).values('id', 'name', 'created_at').order_by('-created_at')
        result = [
            {**s, 'project_id': project.id, 'updated_at': s['created_at']}
            for s in spreadsheets
        ]
        return Response(result)



class DataReportListView(EnglishResponseMixin, APIView):
    """GET /api/agent/data/reports/ — list imported CSV files."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        project = _get_user_project(request)
        if not project:
            return Response(
                {"detail": "No active project."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reports = data_service.list_reports(project)
        return Response(reports)


class DataReportDetailView(EnglishResponseMixin, APIView):
    """GET/DELETE /api/agent/data/reports/<uuid:file_id>/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, file_id):
        project = _get_user_project(request)
        if not project:
            return Response(
                {"detail": "No active project."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = data_service.get_report_data(file_id, project)
        if data is None:
            return Response(
                {"detail": "Report not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(data)

    def delete(self, request, file_id):
        project = _get_user_project(request)
        if not project:
            return Response(
                {"detail": "No active project."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deleted = data_service.delete_report(file_id, project)
        if not deleted:
            return Response(
                {"detail": "File not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DataUploadView(EnglishResponseMixin, APIView):
    """POST /api/agent/data/upload/ — upload a CSV file."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        project = _get_user_project(request)
        if not project:
            return Response(
                {"detail": "No active project."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file = request.FILES.get('file')
        if not file:
            return Response(
                {"detail": "No file provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_exts = ('.csv', '.xlsx', '.xls')
        if not file.name.lower().endswith(allowed_exts):
            return Response(
                {"detail": "Only CSV and Excel files are accepted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_size = 10 * 1024 * 1024  # 10MB
        if file.size > max_size:
            return Response(
                {"detail": "File too large (max 10MB)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = data_service.save_uploaded_file(file, request.user, project)
        if result is None:
            return Response(
                {"detail": "Failed to save file."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(result, status=status.HTTP_201_CREATED)


class FileUploadAnalyzeView(EnglishResponseMixin, APIView):
    """POST /api/agent/upload-analyze/ — upload a file and stream analysis."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    renderer_classes = [EventStreamRenderer, JSONRenderer]

    def post(self, request):
        project = _get_user_project(request)
        if not project:
            return Response(
                {"detail": "No active project."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file = request.FILES.get('file')
        if not file:
            return Response(
                {"detail": "No file provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_exts = ('.csv', '.xlsx', '.xls')
        if not file.name.lower().endswith(allowed_exts):
            return Response(
                {"detail": "Only CSV and Excel files are accepted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_size = 10 * 1024 * 1024  # 10MB
        if file.size > max_size:
            return Response(
                {"detail": "File too large (max 10MB)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Save file
        result = data_service.save_uploaded_file(file, request.user, project)
        if result is None:
            return Response(
                {"detail": "Failed to save file."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Create or reuse session
        session_id = request.data.get('session_id')
        if session_id:
            try:
                session = AgentSession.objects.get(
                    id=session_id, user=request.user, is_deleted=False,
                )
            except AgentSession.DoesNotExist:
                session = AgentSession.objects.create(
                    user=request.user, project=project,
                    title=f"Analysis: {result['original_filename']}",
                )
        else:
            session = AgentSession.objects.create(
                user=request.user, project=project,
                title=f"Analysis: {result['original_filename']}",
            )

        AgentMessage.objects.create(
            session=session,
            role='user',
            content=f'Uploaded "{result["original_filename"]}"',
        )

        orchestrator = AgentOrchestrator(
            user=request.user, project=project, session=session,
        )

        def event_stream():
            # Immediately emit file_uploaded event
            file_event = {
                "type": "file_uploaded",
                "content": f"Uploaded \"{result['original_filename']}\" ({result['row_count']} rows, {result['column_count']} columns).",
                "data": {
                    "file_id": result['id'],
                    "filename": result['filename'],
                    "original_filename": result['original_filename'],
                    "row_count": result['row_count'],
                    "column_count": result['column_count'],
                },
            }
            yield f"data: {json.dumps(file_event)}\n\n"

            # Route through the workflow engine (column detection + analysis).
            assistant_content_parts = []
            assistant_metadata = {"file_id": result['id']}
            last_message_type = 'text'

            try:
                for chunk in orchestrator.handle_message("", file_id=result['id']):
                    chunk_type = chunk.get('type', 'text')
                    content = chunk.get('content', '')
                    data = chunk.get('data')

                    if chunk_type == 'done':
                        # Intercept done event to attach session_id for the frontend.
                        break

                    if content:
                        assistant_content_parts.append(content)
                    last_message_type = chunk_type
                    if data:
                        assistant_metadata.update(data)

                    yield f"data: {json.dumps(chunk, default=str)}\n\n"
            except Exception:
                logger.exception("FileUploadAnalyzeView workflow error")
                yield f"data: {json.dumps({'type': 'error', 'content': 'An internal error occurred. Please try again.'})}\n\n"

            # Save accumulated assistant message
            if assistant_content_parts:
                AgentMessage.objects.create(
                    session=session,
                    role='assistant',
                    content='\n'.join(assistant_content_parts),
                    message_type=last_message_type,
                    metadata=assistant_metadata,
                )

            # Done event with session_id so the frontend can persist the session.
            done_event = {
                "type": "done",
                "data": {"session_id": str(session.id)},
            }
            yield f"data: {json.dumps(done_event)}\n\n"

        response = StreamingHttpResponse(
            event_stream(),
            content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response


class DataReportSummaryView(EnglishResponseMixin, APIView):
    """GET /api/agent/data/reports/summary/ — aggregated KPI data."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        project = _get_user_project(request)
        if not project:
            return Response(
                {"detail": "No active project."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        summary = data_service.get_reports_summary(project)
        if summary is None:
            return Response({"detail": "No data available."}, status=status.HTTP_200_OK)
        return Response(summary)


class AnomalyLatestView(EnglishResponseMixin, APIView):
    """GET /api/agent/anomalies/latest/ — latest anomalies from most recent analysis."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        project = _get_user_project(request)
        if not project:
            return Response(
                {"detail": "No active project."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Find the most recent assistant message that has anomalies in metadata
        msg = (
            AgentMessage.objects
            .filter(
                session__project=project,
                session__user=request.user,
                role='assistant',
            )
            .filter(metadata__has_key='anomalies')
            .order_by('-created_at')
            .first()
        )
        if not msg or not msg.metadata.get('anomalies'):
            return Response([])
        return Response(msg.metadata['anomalies'])


class AgentWorkflowDefinitionViewSet(EnglishResponseMixin, viewsets.ModelViewSet):
    """CRUD for workflow definitions. Shows project-level + system-level workflows."""
    permission_classes = [IsAuthenticated]
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'list':
            return AgentWorkflowDefinitionListSerializer
        return AgentWorkflowDefinitionDetailSerializer

    def get_queryset(self):
        project = _get_user_project(self.request)
        qs = AgentWorkflowDefinition.objects.filter(is_deleted=False)
        if project:
            qs = qs.filter(
                Q(is_system=True) |
                Q(project=project, is_system=False, created_by=self.request.user)
            )
        else:
            qs = qs.filter(is_system=True)
        return qs.order_by('-is_system', '-is_default', '-created_at')

    def perform_create(self, serializer):
        project = _get_user_project(self.request)
        serializer.save(
            project=project,
            created_by=self.request.user,
            is_system=False,
        )

    def perform_update(self, serializer):
        if serializer.instance.is_system:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("System workflows cannot be modified.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_system:
            return Response(
                {"detail": "System workflows cannot be deleted."},
                status=status.HTTP_403_FORBIDDEN,
            )
        instance.is_deleted = True
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Clone a workflow (system or custom) into a new project-scoped draft."""
        source = self.get_object()
        project = _get_user_project(request)
        if not project:
            return Response(
                {'detail': 'An active project is required to duplicate a workflow.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        custom_name = (request.data.get('name') or '').strip()
        new_workflow = _clone_workflow_definition(
            source,
            project=project,
            created_by=request.user,
            name=custom_name or f"{source.name} (Copy)",
            status='draft',
        )
        serializer = AgentWorkflowDefinitionDetailSerializer(new_workflow)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


def _get_workflow_or_404(request, workflow_id):
    """Fetch workflow with project-level access check. Returns (workflow, error_response)."""
    try:
        workflow = AgentWorkflowDefinition.objects.get(
            id=workflow_id, is_deleted=False,
        )
    except AgentWorkflowDefinition.DoesNotExist:
        return None, Response(
            {"detail": "Workflow not found."},
            status=status.HTTP_404_NOT_FOUND,
        )
    # System workflows are visible to all authenticated users
    if not workflow.is_system:
        project = _get_user_project(request)
        if workflow.project != project:
            return None, Response(
                {"detail": "Workflow not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
    return workflow, None


class WorkflowStepView(EnglishResponseMixin, APIView):
    """GET list / POST add step for a workflow definition."""
    permission_classes = [IsAuthenticated]

    def get(self, request, workflow_id):
        workflow, err = _get_workflow_or_404(request, workflow_id)
        if err:
            return err
        steps = workflow.steps.filter(is_deleted=False).order_by('order')
        serializer = AgentWorkflowStepSerializer(steps, many=True)
        return Response(serializer.data)

    def post(self, request, workflow_id):
        workflow, err = _get_workflow_or_404(request, workflow_id)
        if err:
            return err
        if workflow.is_system:
            return Response(
                {"detail": "Cannot modify system workflow steps."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = AgentWorkflowStepSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Auto-assign order if not provided
        max_order = workflow.steps.filter(is_deleted=False).aggregate(
            max_order=Max('order')
        )['max_order'] or 0
        serializer.save(
            workflow=workflow,
            order=serializer.validated_data.get('order', max_order + 1),
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def delete(self, request, workflow_id):
        """Delete a step by step_id query param."""
        workflow, err = _get_workflow_or_404(request, workflow_id)
        if err:
            return err
        if workflow.is_system:
            return Response(
                {"detail": "Cannot modify system workflow steps."},
                status=status.HTTP_403_FORBIDDEN,
            )
        step_id = request.query_params.get('step_id')
        if not step_id:
            return Response(
                {"detail": "step_id query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            step = workflow.steps.get(id=step_id, is_deleted=False)
        except AgentWorkflowStep.DoesNotExist:
            return Response(
                {"detail": "Step not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        step.is_deleted = True
        step.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkflowStepDetailView(EnglishResponseMixin, APIView):
    """PATCH a single step within a workflow definition."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, workflow_id, step_id):
        workflow, err = _get_workflow_or_404(request, workflow_id)
        if err:
            return err
        if workflow.is_system:
            return Response(
                {"detail": "Cannot modify system workflow steps."},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            step = workflow.steps.get(id=step_id, is_deleted=False)
        except AgentWorkflowStep.DoesNotExist:
            return Response(
                {"detail": "Step not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = AgentWorkflowStepSerializer(step, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class StepReorderView(EnglishResponseMixin, APIView):
    """POST reorder steps within a workflow."""
    permission_classes = [IsAuthenticated]

    def post(self, request, workflow_id):
        workflow, err = _get_workflow_or_404(request, workflow_id)
        if err:
            return err
        if workflow.is_system:
            return Response(
                {"detail": "Cannot modify system workflow steps."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = StepReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        step_ids = serializer.validated_data['step_ids']
        steps = workflow.steps.filter(
            id__in=step_ids, is_deleted=False,
        )
        if steps.count() != len(step_ids):
            return Response(
                {"detail": "Some step IDs are invalid."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from django.db import transaction
        with transaction.atomic():
            # Phase 1: move all reordered steps to a safe high-offset zone so that
            # the final sequential assignment (phase 2) does not conflict with any
            # remaining active steps.  We cannot use negative values because
            # PositiveIntegerField enforces a DB-level CHECK (order >= 0).
            max_existing = (
                workflow.steps.aggregate(m=Max('order'))['m'] or 0
            )
            temp_base = max_existing + len(step_ids) + 1000
            for idx, step_id in enumerate(step_ids):
                AgentWorkflowStep.objects.filter(id=step_id).update(
                    order=temp_base + idx + 1
                )
            # Phase 2: assign final sequential 1-based positions
            for idx, step_id in enumerate(step_ids, start=1):
                AgentWorkflowStep.objects.filter(id=step_id).update(order=idx)

        updated_steps = workflow.steps.filter(is_deleted=False).order_by('order')
        return Response(
            AgentWorkflowStepSerializer(updated_steps, many=True).data,
        )


class WorkflowRunListView(EnglishResponseMixin, APIView):
    """GET recent workflow runs for a workflow definition."""
    permission_classes = [IsAuthenticated]

    def get(self, request, workflow_id):
        workflow, err = _get_workflow_or_404(request, workflow_id)
        if err:
            return err

        try:
            limit = int(request.query_params.get('limit', 10))
        except (TypeError, ValueError):
            limit = 10
        limit = max(1, min(limit, 50))

        runs = AgentWorkflowRun.objects.filter(
            workflow_definition_id=workflow.id,
            session__user=request.user,
            is_deleted=False,
        ).order_by('-created_at')[:limit]

        return Response(AgentWorkflowRunSerializer(runs, many=True).data)


class WorkflowRunDetailView(EnglishResponseMixin, APIView):
    """GET execution detail for a workflow run, including step executions."""
    permission_classes = [IsAuthenticated]

    def get(self, request, run_id):
        try:
            run = AgentWorkflowRun.objects.get(
                id=run_id,
                session__user=request.user,
                is_deleted=False,
            )
        except AgentWorkflowRun.DoesNotExist:
            return Response(
                {"detail": "Workflow run not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        run_data = AgentWorkflowRunSerializer(run).data
        executions = run.step_executions.order_by('step_order')
        run_data['step_executions'] = AgentStepExecutionSerializer(
            executions, many=True,
        ).data
        return Response(run_data)


class AgentConfigStatusView(EnglishResponseMixin, APIView):
    """GET /api/agent/config/status/ — check which API keys are configured."""
    permission_classes = [IsAuthenticated]

    # Mapping of response key -> (settings attr, env var fallback)
    KEY_MAP = {
        'gemini': ('GEMINI_API_KEY', 'GEMINI_API_KEY'),
        'anthropic': ('ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY'),
    }

    def get(self, request):
        result = {}
        for key, (settings_attr, env_var) in self.KEY_MAP.items():
            val = getattr(django_settings, settings_attr, None) or os.environ.get(env_var, '')
            result[key] = bool(val and val.strip())
        return Response(result)


def _auto_bind_template_to_projects(template, projects, applied_by):
    """
    Create AgentProjectWorkflowBinding for each project in `projects`.

    Skips projects that already have a binding to this template
    (`unique_together` would reject duplicates anyway, but get_or_create
    avoids the DB error and makes the call idempotent).

    The first binding created for a given project is set as `is_default` so
    the AI intent router can resolve it even when no explicit trigger fires.
    Subsequent bindings for the same project leave `is_default` as False.
    """
    from .models import AgentProjectWorkflowBinding

    for project in projects:
        existing_count = AgentProjectWorkflowBinding.objects.filter(
            project=project, is_deleted=False, is_active=True
        ).count()
        AgentProjectWorkflowBinding.objects.get_or_create(
            project=project,
            template=template,
            defaults={
                'trigger_mode': 'message_keyword',
                'trigger_keywords': [],
                'priority': 10,
                'is_default': existing_count == 0,
                'is_active': True,
                'applied_by': applied_by,
            },
        )


def _clone_workflow_definition(
    source_workflow,
    *,
    project=None,
    created_by=None,
    name=None,
    status='active',
):
    """
    Clone a workflow definition and all its steps.

    Returns a new AgentWorkflowDefinition with:
    - project as provided (None for template-owned copies)
    - is_system=False
    - is_default=False
    - All steps cloned with same order and config
    """
    from django.db import transaction

    with transaction.atomic():
        # Clone workflow definition
        new_workflow = AgentWorkflowDefinition.objects.create(
            name=name or f"{source_workflow.name} (Copy)",
            description=source_workflow.description,
            project=project,
            is_default=False,
            is_system=False,
            status=status,
            created_by=created_by or source_workflow.created_by,
        )

        # Clone all steps
        source_steps = source_workflow.steps.filter(is_deleted=False).order_by('order')
        for step in source_steps:
            AgentWorkflowStep.objects.create(
                workflow=new_workflow,
                name=step.name,
                step_type=step.step_type,
                order=step.order,
                config=step.config.copy() if step.config else {},
                description=step.description,
            )

        return new_workflow


class AgentWorkflowTemplateViewSet(EnglishResponseMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing workflow templates.

    - LIST: Filter by category, search, and optionally project_id (for is_applied annotation).
            Visibility: creator (private) + org members + project members.
    - CREATE: Clone source workflow and create template
    - UPDATE: Only creator can update
    - DELETE: Check for active bindings, return 409 if in use
    """
    permission_classes = [IsAuthenticated]
    serializer_class = AgentWorkflowTemplateSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        from core.models import ProjectMember
        user = self.request.user
        qs = AgentWorkflowTemplate.objects.filter(is_deleted=False)

        # Visibility: private (creator) OR org-shared OR project-shared (M2M)
        user_project_ids = ProjectMember.objects.filter(
            user=user, is_active=True
        ).values_list('project_id', flat=True)
        visibility_q = Q(organization__isnull=True, projects__isnull=True, created_by=user)
        if hasattr(user, 'organization') and user.organization:
            visibility_q |= Q(organization=user.organization)
        if user_project_ids:
            visibility_q |= Q(projects__in=user_project_ids)

        qs = qs.filter(visibility_q)

        # Category filter
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)

        # Search by name
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(name__icontains=search)

        # Annotate is_applied_to_project when project_id is provided
        apply_project_id = self.request.query_params.get('project_id')
        if apply_project_id and self.action == 'list':
            from django.db.models import Exists
            applied_subquery = AgentProjectWorkflowBinding.objects.filter(
                template_id=OuterRef('pk'),
                project_id=apply_project_id,
                is_active=True,
                is_deleted=False,
            )
            qs = qs.annotate(is_applied_to_project=Exists(applied_subquery))

        return qs.prefetch_related('projects').select_related(
            'workflow_definition', 'created_by', 'organization'
        ).distinct().order_by('-created_at')

    def perform_create(self, serializer):
        """Clone source workflow and create template."""
        source_workflow_id = serializer.validated_data.pop('source_workflow_id', None)

        if not source_workflow_id:
            # If no source specified, create empty workflow
            # (This should normally not happen as we require source_workflow_id)
            new_workflow = AgentWorkflowDefinition.objects.create(
                name=f"{serializer.validated_data['name']} Workflow",
                project=None,
                is_system=False,
                is_default=False,
                status='active',
                created_by=self.request.user,
            )
        else:
            # Get source workflow
            try:
                source_workflow = AgentWorkflowDefinition.objects.get(
                    id=source_workflow_id,
                    is_deleted=False
                )
            except AgentWorkflowDefinition.DoesNotExist:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'source_workflow_id': 'Source workflow not found.'})

            # Clone workflow
            new_workflow = _clone_workflow_definition(source_workflow)
            new_workflow.created_by = self.request.user
            new_workflow.name = f"{serializer.validated_data['name']} Workflow"
            new_workflow.save()

        # Create template (serializer.create() also sets the projects M2M)
        serializer.save(
            created_by=self.request.user,
            workflow_definition=new_workflow,
        )

        # Auto-create bindings for every project selected at creation time
        template = serializer.instance
        _auto_bind_template_to_projects(template, template.projects.all(), self.request.user)

    def perform_update(self, serializer):
        """Only allow creator to update their templates. Auto-bind newly added projects."""
        if serializer.instance.created_by != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You can only edit templates you created.')

        old_project_ids = set(
            serializer.instance.projects.values_list('id', flat=True)
        )

        serializer.save()

        # Bind to projects that were newly added during this edit
        new_project_ids = set(
            serializer.instance.projects.values_list('id', flat=True)
        )
        added_ids = new_project_ids - old_project_ids
        if added_ids:
            added_projects = serializer.instance.projects.filter(id__in=added_ids)
            _auto_bind_template_to_projects(
                serializer.instance, added_projects, self.request.user
            )

    def perform_destroy(self, instance):
        """Check for active bindings before deletion."""
        # Check if template is being used
        active_bindings = instance.project_bindings.filter(
            is_active=True,
            is_deleted=False
        ).select_related('project')

        if active_bindings.exists():
            # Return 409 Conflict with binding details
            binding_list = [
                {
                    'project_id': str(binding.project.id),
                    'project_name': binding.project.name
                }
                for binding in active_bindings[:10]  # Limit to 10 for response size
            ]

            from rest_framework.exceptions import ValidationError
            raise ValidationError({
                'error': 'Template is in use',
                'active_bindings': binding_list,
                'message': 'Please remove bindings from projects before deleting this template.'
            })

        # Only creator can delete
        if instance.created_by != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You can only delete templates you created.')

        # Soft delete
        instance.is_deleted = True
        instance.save()


class IsProjectMember:
    """Permission class to check if user is a project member."""
    def has_permission(self, request, view):
        project_id = view.kwargs.get('project_id')
        if not project_id:
            return False

        return ProjectMember.objects.filter(
            project_id=project_id,
            user=request.user,
            # Add status='active' if ProjectMember has such field
        ).exists()


class AgentProjectWorkflowBindingViewSet(EnglishResponseMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing project workflow bindings.

    Nested under /api/agent/projects/{project_id}/workflows/bindings/

    - LIST: All active bindings for the project
    - CREATE: Apply a template to the project
    - UPDATE: Modify trigger conditions, priority, is_default
    - DELETE: Remove binding
    """
    permission_classes = [IsAuthenticated]
    serializer_class = AgentProjectWorkflowBindingSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        project_id = self.kwargs.get('project_id')
        if not project_id:
            return AgentProjectWorkflowBinding.objects.none()

        # Check project membership
        if not ProjectMember.objects.filter(
            project_id=project_id,
            user=self.request.user
        ).exists():
            return AgentProjectWorkflowBinding.objects.none()

        return AgentProjectWorkflowBinding.objects.filter(
            project_id=project_id,
            is_deleted=False
        ).select_related('template', 'template__workflow_definition', 'applied_by').order_by('-priority', 'applied_at')

    def get_serializer_class(self):
        if self.action == 'list' and self.request.query_params.get('lightweight') == 'true':
            # For chat interface lightweight listing
            return AgentProjectWorkflowBindingListSerializer
        return AgentProjectWorkflowBindingSerializer

    def perform_create(self, serializer):
        """Apply a template to the project."""
        project_id = self.kwargs.get('project_id')

        # Verify project membership
        try:
            project = Project.objects.get(id=project_id, is_deleted=False)
            if not ProjectMember.objects.filter(project=project, user=self.request.user).exists():
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('You are not a member of this project.')
        except Project.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound('Project not found.')

        serializer.save(
            project=project,
            applied_by=self.request.user,
        )

    def perform_update(self, serializer):
        """Update binding (any project member can update)."""
        project_id = self.kwargs.get('project_id')

        # Verify project membership
        if not ProjectMember.objects.filter(project_id=project_id, user=self.request.user).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You are not a member of this project.')

        serializer.save()

    def perform_destroy(self, instance):
        """Remove binding (soft delete)."""
        project_id = self.kwargs.get('project_id')

        # Verify project membership
        if not ProjectMember.objects.filter(project_id=project_id, user=self.request.user).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You are not a member of this project.')

        # Soft delete
        instance.is_deleted = True
        instance.save()
