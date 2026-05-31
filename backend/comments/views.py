import logging

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from comments.attachment_previews import get_comment_attachment_preview
from comments.models import Comment, CommentAttachment
from comments.permissions import CommentAccessPermission
from comments.registry import (
    CommentTargetNotFound,
    CommentTargetRegistry,
    InvalidCommentTargetType,
)
from comments.serializers import (
    CommentCreateSerializer,
    CommentAttachmentPreviewSerializer,
    CommentResponseSerializer,
    CommentUpdateSerializer,
    CommentUploadSerializer,
    UserSummarySerializer,
)
from comments.services import (
    CommentService,
    delete_unbound_comment_attachment,
    get_users_with_target_access,
)
from comments.tasks import generate_comment_attachment_preview_task

logger = logging.getLogger(__name__)


def resolve_comment_target(entity_type, entity_id):
    """Resolve query/body entity identifiers into the registry's target object."""

    if not entity_type:
        raise ValidationError({"entity_type": "This query parameter is required."})
    if not entity_id:
        raise ValidationError({"entity_id": "This query parameter is required."})
    try:
        return CommentTargetRegistry.resolve(entity_type, entity_id)
    except InvalidCommentTargetType as exc:
        raise ValidationError({"entity_type": str(exc)})
    except CommentTargetNotFound:
        raise NotFound("Comment target not found.")


def comment_response_context(request, *, target=None, target_obj=None, entity_type=None):
    """Share already-resolved target data with serializers to avoid GenericForeignKey N+1s."""

    if target is not None:
        target_obj = target.obj
        entity_type = target.entity_type
    return {
        "request": request,
        "comment_target": target_obj,
        "entity_type": entity_type,
    }


class CommentCollectionView(APIView):
    """List comments for a target entity or create a new target-bound comment."""

    permission_classes = [IsAuthenticated, CommentAccessPermission]

    def get(self, request):
        """List non-deleted comments inherited from the resolved parent entity."""

        target = getattr(self, "comment_target", None) or resolve_comment_target(
            request.query_params.get("entity_type"),
            request.query_params.get("entity_id"),
        )
        content_type = ContentType.objects.get_for_model(target.obj)
        comments = Comment.objects.filter(
            content_type=content_type,
            object_id=str(target.obj.pk),
        ).select_related(
            "author",
            "content_type",
        ).prefetch_related(
            "mentions__mentioned_user",
        ).order_by("-created_at")
        serializer = CommentResponseSerializer(
            comments,
            many=True,
            context=comment_response_context(request, target=target),
        )
        return Response(serializer.data)

    def post(self, request):
        """Create through CommentService so related writes stay transactional."""

        serializer = CommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        target = getattr(self, "comment_target", None) or resolve_comment_target(
            data["entity_type"],
            data["entity_id"],
        )
        comment = CommentService.create_comment(
            user=request.user,
            target=target.obj,
            body=data["body"],
            body_format=data.get("body_format"),
            mention_user_ids=data.get("mentions", []),
            attachment_ids=data.get("attachment_ids", []),
        )
        output = CommentResponseSerializer(
            comment,
            context=comment_response_context(request, target=target),
        )
        return Response(output.data, status=status.HTTP_201_CREATED)


class CommentDetailView(APIView):
    """Read, update, or soft-delete a single non-deleted comment."""

    permission_classes = [IsAuthenticated, CommentAccessPermission]

    def get_comment(self):
        """Reuse the permission layer's already-resolved comment instance."""

        return getattr(self, "comment_obj", None)

    def get(self, request, comment_id):
        """Return one visible comment with permissions for frontend actions."""

        serializer = CommentResponseSerializer(
            self.get_comment(),
            context=comment_response_context(
                request,
                target_obj=getattr(self, "comment_target_obj", None),
                entity_type=getattr(self, "comment_entity_type", None),
            ),
        )
        return Response(serializer.data)

    def patch(self, request, comment_id):
        """Partially update a comment."""

        return self._update(request)

    def put(self, request, comment_id):
        """Replace supported mutable fields for a comment."""

        return self._update(request)

    def delete(self, request, comment_id):
        """Soft delete and return Jira-style 204 with no tombstone payload."""

        CommentService.soft_delete_comment(user=request.user, comment=self.get_comment())
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _update(self, request):
        """Map serializer fields to service arguments without duplicating rules."""

        serializer = CommentUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        kwargs = {}
        if "body" in data:
            kwargs["body"] = data["body"]
        if "body_format" in data:
            kwargs["body_format"] = data["body_format"]
        if "mentions" in data:
            kwargs["mention_user_ids"] = data["mentions"]
        if "attachment_ids" in data:
            kwargs["attachment_ids"] = data["attachment_ids"]
        comment = CommentService.update_comment(
            user=request.user,
            comment=self.get_comment(),
            **kwargs,
        )
        output = CommentResponseSerializer(
            comment,
            context=comment_response_context(
                request,
                target_obj=getattr(self, "comment_target_obj", None),
                entity_type=getattr(self, "comment_entity_type", None),
            ),
        )
        return Response(output.data)


class CommentAttachmentUploadView(APIView):
    """Upload a file and return its UUID for later comment binding."""

    permission_classes = [IsAuthenticated, CommentAccessPermission]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        """Persist an unbound attachment owned by the current user."""

        serializer = CommentUploadSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        attachment = serializer.save()
        transaction.on_commit(
            lambda attachment_id=str(attachment.id): _enqueue_attachment_preview_generation(
                attachment_id
            )
        )
        output = CommentUploadSerializer(attachment, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)


class CommentAttachmentPreviewView(APIView):
    """Return preview readiness metadata for a comment attachment."""

    permission_classes = [IsAuthenticated]

    def get(self, request, attachment_id):
        """Resolve preview metadata without generating converted preview assets."""

        try:
            attachment = CommentAttachment.objects.select_related(
                "comment",
                "comment__content_type",
                "uploaded_by",
            ).get(pk=attachment_id)
        except (CommentAttachment.DoesNotExist, ValueError, TypeError):
            raise NotFound("Attachment not found.")

        preview = get_comment_attachment_preview(
            attachment=attachment,
            user=request.user,
            request=request,
        )
        serializer = CommentAttachmentPreviewSerializer(preview)
        return Response(serializer.data)


class CommentAttachmentDetailView(APIView):
    """Delete staged uploads that never became part of a saved comment."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, attachment_id):
        try:
            attachment = CommentAttachment.objects.get(pk=attachment_id)
        except (CommentAttachment.DoesNotExist, ValueError, TypeError):
            raise NotFound("Attachment not found.")

        delete_unbound_comment_attachment(user=request.user, attachment=attachment)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _enqueue_attachment_preview_generation(attachment_id):
    try:
        generate_comment_attachment_preview_task.delay(attachment_id)
    except Exception:
        logger.exception(
            "Comment attachment preview enqueue failed for attachment %s",
            attachment_id,
        )


class CommentMentionUserSearchView(APIView):
    """Search mentionable users for a target entity."""

    permission_classes = [IsAuthenticated, CommentAccessPermission]

    def get(self, request):
        """Return only users who have base read access to the target."""

        target = getattr(self, "comment_target", None) or resolve_comment_target(
            request.query_params.get("entity_type"),
            request.query_params.get("entity_id"),
        )
        users = get_users_with_target_access(
            target=target.obj,
            query=request.query_params.get("q"),
        )
        serializer = UserSummarySerializer(users, many=True)
        return Response(serializer.data)
