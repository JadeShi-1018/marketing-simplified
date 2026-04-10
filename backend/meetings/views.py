import json
import logging
import traceback

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import DatabaseError, IntegrityError, transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Project, ProjectMember
from meetings.models import (
    Meeting,
    AgendaItem,
    ParticipantLink,
    ArtifactLink,
    MeetingTemplate,
    MeetingDocument,
)
from meetings.serializers import (
    MeetingSerializer,
    MeetingListSerializer,
    MeetingKnowledgeDiscoveryQuerySerializer,
    AgendaItemSerializer,
    ParticipantLinkSerializer,
    ArtifactLinkSerializer,
    MeetingTemplateSerializer,
    MeetingDocumentSerializer,
)
from meetings.services import (
    reorder_agenda_items,
    get_or_create_meeting_document,
    update_meeting_document_content,
    user_has_meeting_document_access,
    meetings_base_queryset_for_project,
    apply_meeting_knowledge_filters,
    meeting_list_order_by_fields,
    hub_split_meeting_pks_for_project,
)
from notifications.models import NotificationCategory, NotificationEventType
from notifications.services import create_notification


logger = logging.getLogger(__name__)

# Default workspace module order (matches frontend initial blocks).
DEFAULT_MEETING_LAYOUT = [
    {"id": "header", "type": "header"},
    {"id": "agenda", "type": "agenda"},
    {"id": "participants", "type": "participants"},
    {"id": "artifacts", "type": "artifacts"},
]

def _ensure_project_membership(user, project: Project) -> None:
    if not ProjectMember.objects.filter(
        user=user,
        project=project,
        is_active=True,
    ).exists():
        raise PermissionDenied("You do not have access to this project.")


def _ensure_meeting_document_access(user, meeting: Meeting) -> None:
    if user_has_meeting_document_access(user.id, meeting):
        return
    raise PermissionDenied("You do not have access to this meeting document.")


class MeetingViewSet(viewsets.ModelViewSet):
    serializer_class = MeetingSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = PageNumberPagination

    def list(self, request, *args, **kwargs):
        try:
            return super().list(request, *args, **kwargs)
        except (Http404, NotFound, PermissionDenied):
            raise
        except DatabaseError:
            logger.exception("Meeting list failed (database)")
            return Response(
                {
                    "detail": "Could not load meetings. If this persists, ensure database migrations are applied for the meetings app.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def retrieve(self, request, *args, **kwargs):
        try:
            instance = self.get_object()
        except (Http404, NotFound, PermissionDenied):
            raise
        except DatabaseError:
            logger.exception("Meeting retrieve failed (database)")
            return Response(
                {
                    "detail": "Could not load meeting. If this persists, ensure database migrations are applied for the meetings app.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        instance = self._normalize_meeting_layout(instance)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def _normalize_meeting_layout(self, meeting: Meeting) -> Meeting:
        lc = meeting.layout_config

        def persist(next_lc):
            meeting.layout_config = next_lc
            try:
                meeting.save(update_fields=["layout_config"])
            except DatabaseError:
                logger.exception("Could not persist default layout_config for meeting %s", meeting.pk)

        if lc is None:
            persist(list(DEFAULT_MEETING_LAYOUT))
            return meeting

        if isinstance(lc, list):
            if len(lc) == 0:
                persist(list(DEFAULT_MEETING_LAYOUT))
            return meeting

        if isinstance(lc, dict):
            blocks = lc.get("blocks")
            if not isinstance(blocks, list) or len(blocks) == 0:
                persist({**lc, "blocks": list(DEFAULT_MEETING_LAYOUT)})
            return meeting

        persist(list(DEFAULT_MEETING_LAYOUT))
        return meeting

    def get_project(self) -> Project:
        project_id = self.kwargs.get("project_id")
        project = get_object_or_404(Project, id=project_id)
        _ensure_project_membership(self.request.user, project)
        return project

    def get_queryset(self):
        return meetings_base_queryset_for_project(self.get_project())

    def get_serializer_class(self):
        if self.action == "list":
            return MeetingListSerializer
        return MeetingSerializer

    def list(self, request, *args, **kwargs):
        project = self.get_project()
        query_serializer = MeetingKnowledgeDiscoveryQuerySerializer(
            data=request.query_params,
            context={"project": project, "request": request},
        )
        query_serializer.is_valid(raise_exception=True)
        filters = dict(query_serializer.validated_data)

        qs_base = meetings_base_queryset_for_project(project)

        incoming_pks, completed_pks = hub_split_meeting_pks_for_project(project)
        qs_incoming_lane = qs_base.filter(pk__in=incoming_pks).distinct()
        qs_completed_lane = qs_base.filter(pk__in=completed_pks).distinct()

        incoming_result_count = (
            apply_meeting_knowledge_filters(qs_incoming_lane, filters).distinct().count()
        )
        completed_result_count = (
            apply_meeting_knowledge_filters(qs_completed_lane, filters).distinct().count()
        )

        qs_filtered = apply_meeting_knowledge_filters(qs_base, filters).distinct()

        ordering = filters.get("ordering") or "-created_at"
        qs = qs_filtered.order_by(*meeting_list_order_by_fields(ordering))

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            paginated = self.get_paginated_response(serializer.data)
            # Build a plain dict so hub fields always appear in JSON (avoid mutating ReturnDict edge cases).
            hub = {
                "incoming_lane_total": len(incoming_pks),
                "incoming_result_count": incoming_result_count,
                "completed_lane_total": len(completed_pks),
                "completed_result_count": completed_result_count,
                # Deprecated aliases (same values as *_result_count); kept for older clients.
                "incoming_lane_filtered": incoming_result_count,
                "completed_lane_filtered": completed_result_count,
            }
            payload = {**dict(paginated.data), **hub}
            return Response(payload)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        project = self.get_project()
        # If the client doesn't provide a layout_config, initialize it to the default
        # workspace module order so the editor always has a predictable starting state.
        lc = serializer.validated_data.get("layout_config")
        if lc is None:
            serializer.validated_data["layout_config"] = list(DEFAULT_MEETING_LAYOUT)
        elif isinstance(lc, list) and len(lc) == 0:
            serializer.validated_data["layout_config"] = list(DEFAULT_MEETING_LAYOUT)
        elif isinstance(lc, dict):
            blocks = lc.get("blocks")
            if not isinstance(blocks, list) or len(blocks) == 0:
                serializer.validated_data["layout_config"] = {
                    **lc,
                    "blocks": list(DEFAULT_MEETING_LAYOUT),
                }
        raw_ids = serializer.validated_data.pop("participant_user_ids", None)
        if raw_ids is None:
            participant_user_ids: list[int] = []
        else:
            participant_user_ids = list(dict.fromkeys(int(x) for x in raw_ids))

        # Strict mode used to require the client to send ids; create flow no longer asks
        # for participants on the form — default to the creator so the meeting always has
        # at least one participant when the setting is enabled.
        if getattr(settings, "MEETINGS_REQUIRE_PARTICIPANTS_AT_CREATE", False):
            if len(participant_user_ids) < 1:
                participant_user_ids = [self.request.user.id]

        User = get_user_model()

        with transaction.atomic():
            meeting = serializer.save(project=project)

            if not participant_user_ids:
                return

            for uid in participant_user_ids:
                if not User.objects.filter(pk=uid).exists():
                    raise ValidationError(
                        {"participant_user_ids": [f"Unknown user id: {uid}."]}
                    )
                if not ProjectMember.objects.filter(
                    user_id=uid,
                    project=project,
                    is_active=True,
                ).exists():
                    raise ValidationError(
                        {
                            "participant_user_ids": [
                                f"User {uid} is not an active member of this project."
                            ]
                        }
                    )

            for uid in participant_user_ids:
                try:
                    ParticipantLink.objects.get_or_create(
                        meeting=meeting,
                        user_id=uid,
                        defaults={"role": None},
                    )
                except IntegrityError as exc:
                    raise ValidationError(
                        {
                            "participant_user_ids": [
                                "Could not attach participants; please retry."
                            ]
                        }
                    ) from exc

        if participant_user_ids:
            for uid in participant_user_ids:
                if uid == self.request.user.id:
                    continue
                create_notification(
                    recipient_id=uid,
                    actor_id=self.request.user.id,
                    category=NotificationCategory.MEETINGS,
                    event_type=NotificationEventType.MEETING_CREATED,
                    title=f"New meeting: {meeting.title}",
                    body="You were added as a participant.",
                    related_object_type="meeting",
                    related_object_id=str(meeting.id),
                    action_url=f"/projects/{project.id}/meetings/{meeting.id}",
                    metadata={"project_id": project.id},
                )

    def perform_update(self, serializer):
        meeting = serializer.instance
        project = meeting.project

        # Use raw SQL to absolutely bypass any ORM caching - get CURRENT database state
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT title, objective, scheduled_date, scheduled_time, type_definition_id, external_reference, layout_config FROM meetings_meeting WHERE id = %s",
                [meeting.pk]
            )
            row = cursor.fetchone()

        if row:
            db_layout_config = row[6]
            if isinstance(db_layout_config, str):
                try:
                    db_layout_config = json.loads(db_layout_config)
                except:
                    pass
            before = {
                "title": row[0],
                "objective": row[1],
                "scheduled_date": str(row[2]) if row[2] else None,
                "scheduled_time": str(row[3]) if row[3] else None,
                "type_definition_id": row[4],
                "external_reference": row[5],
                "layout_config": db_layout_config,
            }
        else:
            before = {
                "title": None, "objective": None, "scheduled_date": None,
                "scheduled_time": None, "type_definition_id": None,
                "external_reference": None, "layout_config": None,
            }

        # Build "after" from INCOMING data (what frontend is sending), NOT from database after save
        # This ensures we compare what's in DB vs what frontend wants to save
        validated = serializer.validated_data
        after = {
            "title": validated.get("title", before["title"]),
            "objective": validated.get("objective", before["objective"]),
            "scheduled_date": str(validated["scheduled_date"]) if validated.get("scheduled_date") else before["scheduled_date"],
            "scheduled_time": str(validated["scheduled_time"]) if validated.get("scheduled_time") else before["scheduled_time"],
            "type_definition_id": validated.get("type_definition_id", before["type_definition_id"]),
            "external_reference": validated.get("external_reference", before["external_reference"]),
            "layout_config": validated.get("layout_config", before["layout_config"]),
        }

        # Save to database
        serializer.save()

        # Check if anything changed
        if json.dumps(before, sort_keys=True, default=str) == json.dumps(after, sort_keys=True, default=str):
            return

        # Helper function to extract agenda items from layout_config.nestedSections
        def extract_agenda_items(layout_config):
            """Extract all agenda item texts from nestedSections."""
            if not layout_config or not isinstance(layout_config, dict):
                return {}
            nested_sections = layout_config.get("nestedSections", [])
            if not isinstance(nested_sections, list):
                return {}
            # Map item id -> (section_title, item_text)
            items = {}
            for section in nested_sections:
                if not isinstance(section, dict):
                    continue
                section_title = section.get("title", "")
                for item in section.get("items", []):
                    if isinstance(item, dict):
                        item_id = item.get("id")
                        item_text = item.get("text", "")
                        if item_id:
                            items[str(item_id)] = {"section": section_title, "text": item_text}
            return items

        # Build change details for notification metadata
        changes = {}
        if before["scheduled_date"] != after["scheduled_date"] or before["scheduled_time"] != after["scheduled_time"]:
            old_time = None
            new_time = None
            if before["scheduled_date"]:
                old_time = before["scheduled_date"]
                if before["scheduled_time"]:
                    old_time += f" {before['scheduled_time']}"
            if after["scheduled_date"]:
                new_time = after["scheduled_date"]
                if after["scheduled_time"]:
                    new_time += f" {after['scheduled_time']}"
            changes["old_time"] = old_time
            changes["new_time"] = new_time
        if before["objective"] != after["objective"]:
            changes["old_agenda"] = before["objective"]
            changes["new_agenda"] = after["objective"]
        if before["external_reference"] != after["external_reference"]:
            changes["old_location"] = before["external_reference"]
            changes["new_location"] = after["external_reference"]
        if before["title"] != after["title"]:
            changes["old_title"] = before["title"]
            changes["new_title"] = after["title"]

        # Detect agenda changes within layout_config.nestedSections
        old_layout = before["layout_config"]
        new_layout = after["layout_config"]
        if isinstance(old_layout, str):
            try:
                old_layout = json.loads(old_layout)
            except (json.JSONDecodeError, TypeError):
                old_layout = None
        if isinstance(new_layout, str):
            try:
                new_layout = json.loads(new_layout)
            except (json.JSONDecodeError, TypeError):
                new_layout = None

        old_items = extract_agenda_items(old_layout)
        new_items = extract_agenda_items(new_layout)

        old_item_ids = set(old_items.keys())
        new_item_ids = set(new_items.keys())

        # Find added, removed, and modified items
        added_ids = new_item_ids - old_item_ids
        removed_ids = old_item_ids - new_item_ids
        common_ids = old_item_ids & new_item_ids

        modified_items = []
        section_changes = []
        for item_id in common_ids:
            old_text = old_items[item_id]["text"]
            new_text = new_items[item_id]["text"]
            old_section = old_items[item_id]["section"]
            new_section = new_items[item_id]["section"]

            # Check for text changes
            if old_text != new_text:
                modified_items.append({
                    "id": item_id,
                    "old_text": old_text,
                    "new_text": new_text,
                })

            # Check for section/group name changes
            if old_section != new_section:
                section_changes.append({
                    "id": item_id,
                    "old_section": old_section,
                    "new_section": new_section,
                })

        # Build agenda change summary
        agenda_changes = []

        # Handle modified items - show before/after
        if modified_items:
            first_mod = modified_items[0]
            changes["old_agenda"] = first_mod["old_text"]
            changes["new_agenda"] = first_mod["new_text"]
            for mod in modified_items:
                agenda_changes.append(f"Modified: '{mod['old_text']}' → '{mod['new_text']}'")

        # Handle section name changes
        if section_changes:
            first_sec = section_changes[0]
            if not changes.get("old_agenda"):
                changes["old_agenda"] = f"Section: {first_sec['old_section']}"
            if not changes.get("new_agenda"):
                changes["new_agenda"] = f"Section: {first_sec['new_section']}"
            for sec in section_changes:
                agenda_changes.append(f"Section renamed: '{sec['old_section']}' → '{sec['new_section']}'")

        # Handle removed items
        if removed_ids:
            removed_texts = [old_items[rid]["text"] for rid in removed_ids]
            if not changes.get("old_agenda"):
                changes["old_agenda"] = removed_texts[0] if len(removed_texts) == 1 else "; ".join(removed_texts)
            for text in removed_texts:
                agenda_changes.append(f"Removed: '{text}'")

        # Handle added items
        if added_ids:
            added_texts = [new_items[aid]["text"] for aid in added_ids]
            if not changes.get("new_agenda"):
                changes["new_agenda"] = added_texts[0] if len(added_texts) == 1 else "; ".join(added_texts)
            for text in added_texts:
                agenda_changes.append(f"Added: '{text}'")

        # If no changes detected at all, skip notification
        if not changes:
            return

        # Send notifications to participants
        participant_ids = meeting.participant_links.values_list("user_id", flat=True)
        for uid in participant_ids:
            if uid == self.request.user.id:
                continue
            create_notification(
                recipient_id=uid,
                actor_id=self.request.user.id,
                category=NotificationCategory.MEETINGS,
                event_type=NotificationEventType.MEETING_UPDATED,
                title=f"Meeting updated: {meeting.title}",
                body="Meeting details were changed.",
                related_object_type="meeting",
                related_object_id=str(meeting.id),
                action_url=f"/projects/{project.id}/meetings/{meeting.id}",
                metadata={"project_id": project.id, **changes},
            )


class AgendaItemViewSet(viewsets.ModelViewSet):
    serializer_class = AgendaItemSerializer
    permission_classes = [IsAuthenticated]

    def get_meeting(self) -> Meeting:
        project_id = self.kwargs.get("project_id")
        meeting_id = self.kwargs.get("meeting_id")
        meeting = get_object_or_404(
            Meeting.objects.select_related("project"),
            id=meeting_id,
            project_id=project_id,
        )
        _ensure_project_membership(self.request.user, meeting.project)
        return meeting

    def get_queryset(self):
        meeting = self.get_meeting()
        return meeting.agenda_items.all().order_by("order_index", "id")

    def perform_create(self, serializer):
        meeting = self.get_meeting()
        try:
            agenda_item = serializer.save(meeting=meeting)
        except IntegrityError:
            from rest_framework.exceptions import ValidationError

            raise ValidationError(
                {"order_index": ["This order_index is already used for this meeting."]}
            )

        # Notify participants about new agenda item
        participant_ids = meeting.participant_links.values_list("user_id", flat=True)
        for uid in participant_ids:
            if uid == self.request.user.id:
                continue
            create_notification(
                recipient_id=uid,
                actor_id=self.request.user.id,
                category=NotificationCategory.MEETINGS,
                event_type=NotificationEventType.MEETING_AGENDA_CHANGED,
                title=f"Agenda updated: {meeting.title}",
                body="A new agenda item was added.",
                related_object_type="meeting",
                related_object_id=str(meeting.id),
                action_url=f"/projects/{meeting.project_id}/meetings/{meeting.id}",
                metadata={
                    "project_id": meeting.project_id,
                    "new_agenda": agenda_item.content,
                },
            )

    def perform_update(self, serializer):
        agenda_item = serializer.instance
        meeting = agenda_item.meeting

        # Fetch original content from database BEFORE save
        original_values = AgendaItem.objects.filter(pk=agenda_item.pk).values('content').first()
        old_content = original_values["content"] if original_values else ""

        # Save the changes
        serializer.save()
        agenda_item.refresh_from_db()
        new_content = agenda_item.content

        # Only notify if content actually changed
        if old_content == new_content:
            return

        # Notify participants about modified agenda item
        participant_ids = meeting.participant_links.values_list("user_id", flat=True)
        for uid in participant_ids:
            if uid == self.request.user.id:
                continue
            create_notification(
                recipient_id=uid,
                actor_id=self.request.user.id,
                category=NotificationCategory.MEETINGS,
                event_type=NotificationEventType.MEETING_AGENDA_CHANGED,
                title=f"Agenda updated: {meeting.title}",
                body="An agenda item was modified.",
                related_object_type="meeting",
                related_object_id=str(meeting.id),
                action_url=f"/projects/{meeting.project_id}/meetings/{meeting.id}",
                metadata={
                    "project_id": meeting.project_id,
                    "old_agenda": old_content,
                    "new_agenda": new_content,
                },
            )

    def perform_destroy(self, instance):
        meeting = instance.meeting
        removed_content = instance.content

        # Delete the agenda item
        instance.delete()

        # Notify participants about removed agenda item
        participant_ids = meeting.participant_links.values_list("user_id", flat=True)
        for uid in participant_ids:
            if uid == self.request.user.id:
                continue
            create_notification(
                recipient_id=uid,
                actor_id=self.request.user.id,
                category=NotificationCategory.MEETINGS,
                event_type=NotificationEventType.MEETING_AGENDA_CHANGED,
                title=f"Agenda updated: {meeting.title}",
                body="An agenda item was removed.",
                related_object_type="meeting",
                related_object_id=str(meeting.id),
                action_url=f"/projects/{meeting.project_id}/meetings/{meeting.id}",
                metadata={
                    "project_id": meeting.project_id,
                    "old_agenda": removed_content,
                },
            )

    @action(detail=False, methods=["patch"], url_path="reorder")
    def reorder(self, request, project_id=None, meeting_id=None):
        meeting = self.get_meeting()
        items = request.data.get("items", [])
        if not isinstance(items, list):
            return Response(
                {"items": ["This field must be a list of objects."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        normalized = []
        for item in items:
            try:
                normalized.append(
                    {
                        "id": int(item["id"]),
                        "order_index": int(item["order_index"]),
                    }
                )
            except (KeyError, TypeError, ValueError):
                return Response(
                    {
                        "items": [
                            "Each item must contain integer 'id' and 'order_index'."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        updated_items = reorder_agenda_items(meeting.id, normalized)
        serializer = self.get_serializer(updated_items, many=True)
        return Response(serializer.data)


class ParticipantLinkViewSet(viewsets.ModelViewSet):
    serializer_class = ParticipantLinkSerializer
    permission_classes = [IsAuthenticated]

    def get_meeting(self) -> Meeting:
        project_id = self.kwargs.get("project_id")
        meeting_id = self.kwargs.get("meeting_id")
        meeting = get_object_or_404(
            Meeting.objects.select_related("project"),
            id=meeting_id,
            project_id=project_id,
        )
        _ensure_project_membership(self.request.user, meeting.project)
        return meeting

    def get_queryset(self):
        meeting = self.get_meeting()
        return meeting.participant_links.all()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.action in {"create", "update", "partial_update"}:
            context["meeting"] = self.get_meeting()
        return context

    def perform_create(self, serializer):
        meeting = self.get_meeting()
        link = serializer.save(meeting=meeting)
        if link.user_id != self.request.user.id:
            create_notification(
                recipient_id=link.user_id,
                actor_id=self.request.user.id,
                category=NotificationCategory.MEETINGS,
                event_type=NotificationEventType.MEETING_PARTICIPANT_ADDED,
                title=f"Added to meeting: {meeting.title}",
                body="You were added as a participant.",
                related_object_type="meeting",
                related_object_id=str(meeting.id),
                action_url=f"/projects/{meeting.project_id}/meetings/{meeting.id}",
                metadata={"project_id": meeting.project_id},
            )


class ArtifactLinkViewSet(viewsets.ModelViewSet):
    serializer_class = ArtifactLinkSerializer
    permission_classes = [IsAuthenticated]

    def get_meeting(self) -> Meeting:
        project_id = self.kwargs.get("project_id")
        meeting_id = self.kwargs.get("meeting_id")
        meeting = get_object_or_404(
            Meeting.objects.select_related("project"),
            id=meeting_id,
            project_id=project_id,
        )
        _ensure_project_membership(self.request.user, meeting.project)
        return meeting

    def get_queryset(self):
        meeting = self.get_meeting()
        return meeting.artifact_links.all()

    def perform_create(self, serializer):
        meeting = self.get_meeting()
        artifact = serializer.save(meeting=meeting)

        # Notify participants about new artifact
        participant_ids = meeting.participant_links.values_list("user_id", flat=True)
        for uid in participant_ids:
            if uid == self.request.user.id:
                continue
            create_notification(
                recipient_id=uid,
                actor_id=self.request.user.id,
                category=NotificationCategory.MEETINGS,
                event_type=NotificationEventType.MEETING_UPDATED,
                title=f"Artifact added to meeting: {meeting.title}",
                body=f"A new {artifact.artifact_type} was linked to this meeting.",
                related_object_type="meeting",
                related_object_id=str(meeting.id),
                action_url=f"/projects/{meeting.project_id}/meetings/{meeting.id}",
                metadata={
                    "project_id": meeting.project_id,
                    "added_artifacts": [f"{artifact.artifact_type} (ID: {artifact.artifact_id})"],
                },
            )

    def perform_destroy(self, instance):
        meeting = instance.meeting
        artifact_info = f"{instance.artifact_type} (ID: {instance.artifact_id})"

        # Delete the artifact link
        instance.delete()

        # Notify participants about removed artifact
        participant_ids = meeting.participant_links.values_list("user_id", flat=True)
        for uid in participant_ids:
            if uid == self.request.user.id:
                continue
            create_notification(
                recipient_id=uid,
                actor_id=self.request.user.id,
                category=NotificationCategory.MEETINGS,
                event_type=NotificationEventType.MEETING_UPDATED,
                title=f"Artifact removed from meeting: {meeting.title}",
                body=f"An artifact was unlinked from this meeting.",
                related_object_type="meeting",
                related_object_id=str(meeting.id),
                action_url=f"/projects/{meeting.project_id}/meetings/{meeting.id}",
                metadata={
                    "project_id": meeting.project_id,
                    "removed_artifacts": [artifact_info],
                },
            )


class MeetingTemplateViewSet(viewsets.ModelViewSet):
    """
    Reusable workspace templates for the Meeting editor.
    """

    queryset = MeetingTemplate.objects.all()
    serializer_class = MeetingTemplateSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except APIException:
            raise
        except Exception as e:
            logger.error(traceback.format_exc())
            body = {"error": str(e)}
            if settings.DEBUG:
                body["traceback"] = traceback.format_exc()
            return Response(body, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def perform_create(self, serializer):
        # id is generated by the model; keep name + layout_config from request.
        serializer.save()

    def partial_update(self, request, *args, **kwargs):
        """
        Upsert style PATCH support.

        The frontend previously saved built-in templates keyed by `meetingType` (string),
        so this view allows updating/creating by pk if it doesn't exist yet.
        """
        template_id = kwargs.get("pk")
        if not template_id:
            return super().partial_update(request, *args, **kwargs)

        template, _ = MeetingTemplate.objects.get_or_create(
            id=str(template_id),
            defaults={"name": str(template_id)},
        )

        serializer = self.get_serializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class MeetingDocumentAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_meeting(self, project_id: int, meeting_id: int) -> Meeting:
        meeting = get_object_or_404(
            Meeting.objects.select_related("project"),
            id=meeting_id,
            project_id=project_id,
        )
        _ensure_meeting_document_access(self.request.user, meeting)
        return meeting

    def get(self, request, project_id: int, meeting_id: int):
        meeting = self._get_meeting(project_id, meeting_id)
        document = get_or_create_meeting_document(meeting.id)
        serializer = MeetingDocumentSerializer(document)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, project_id: int, meeting_id: int):
        meeting = self._get_meeting(project_id, meeting_id)
        content = request.data.get("content")
        if not isinstance(content, str):
            raise ValidationError({"content": ["This field is required and must be a string."]})
        yjs_state = request.data.get("yjs_state")
        if yjs_state is not None and not isinstance(yjs_state, str):
            raise ValidationError({"yjs_state": ["This field must be a string."]})
        document = update_meeting_document_content(
            meeting_id=meeting.id,
            content=content,
            yjs_state=yjs_state,
            user_id=request.user.id,
        )
        serializer = MeetingDocumentSerializer(document)
        return Response(serializer.data, status=status.HTTP_200_OK)

