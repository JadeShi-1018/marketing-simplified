from django.apps import apps
from django.http import Http404
from rest_framework import permissions
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from comments.models import Comment
from comments.registry import (
    CommentTargetNotFound,
    CommentTargetRegistry,
    InvalidCommentTargetType,
)


class CommentPermissionService:
    """
    Central authorization service for comments.

    DRF permissions, serializers, mention validation, and write services all
    delegate here so the task access rule has one authoritative implementation.
    """

    @classmethod
    def can_read(cls, user, target):
        """Read visibility is inherited from the parent business entity."""

        if not getattr(user, "is_authenticated", False):
            return False

        Task = apps.get_model("task", "Task")
        if isinstance(target, Task):
            ProjectMember = apps.get_model("core", "ProjectMember")
            # Task access: active project member OR current approver.
            if ProjectMember.objects.filter(
                user=user,
                project=target.project,
                is_active=True,
            ).exists():
                return True
            return target.current_approver_id is not None and target.current_approver_id == user.id

        return False

    @classmethod
    def can_create(cls, user, target):
        """Creating a comment requires the same base access as reading comments."""

        return cls.can_read(user, target)

    @classmethod
    def can_update(cls, user, comment, target=None):
        """Only the author may edit, and only while they still have target access."""

        if comment.deleted_at is not None or comment.author_id != getattr(user, "id", None):
            return False
        target = target if target is not None else comment.content_object
        return target is not None and cls.can_read(user, target)

    @classmethod
    def can_delete(cls, user, comment, target=None):
        """Deletion uses the same author-plus-access rule as updates."""

        return cls.can_update(user, comment, target=target)


class CommentAccessPermission(permissions.BasePermission):
    """
    DRF bridge for comment access. Business rules stay in CommentPermissionService.
    Views may reuse the resolved target/comment stored on the view.
    """

    def has_permission(self, request, view):
        """Resolve the relevant target/comment early so views can reuse it safely."""

        comment_id = view.kwargs.get("comment_id")
        if comment_id:
            comment = self._get_comment(comment_id)
            target = comment.content_object
            view.comment_obj = comment
            view.comment_target_obj = target
            view.comment_entity_type = self._get_entity_type(target)
            # Detail reads require inherited target visibility; writes also require authorship.
            allowed = (
                CommentPermissionService.can_read(request.user, target)
                if request.method in permissions.SAFE_METHODS
                else CommentPermissionService.can_update(request.user, comment, target=target)
            )
            if not allowed:
                raise PermissionDenied("You do not have access to this comment.")
            return True

        if request.method in permissions.SAFE_METHODS:
            entity_type = request.query_params.get("entity_type")
            entity_id = request.query_params.get("entity_id")
            action = "read"
        else:
            entity_type = request.data.get("entity_type")
            entity_id = request.data.get("entity_id")
            action = "create"

        if not entity_type or not entity_id:
            # Let serializers/views produce field-specific 400 responses for missing params.
            return True

        target = self._resolve_target(entity_type, entity_id)
        view.comment_target = target
        allowed = (
            CommentPermissionService.can_read(request.user, target.obj)
            if action == "read"
            else CommentPermissionService.can_create(request.user, target.obj)
        )
        if not allowed:
            raise PermissionDenied("You do not have access to this comment target.")
        return True

    def _get_comment(self, comment_id):
        """Fetch only non-deleted comments; deleted comments must behave like 404."""

        try:
            return Comment.objects.select_related(
                "author",
                "content_type",
                "deleted_by",
            ).prefetch_related(
                "mentions__mentioned_user",
            ).get(pk=comment_id)
        except (Comment.DoesNotExist, ValueError, TypeError):
            raise NotFound("Comment not found.")

    def _resolve_target(self, entity_type, entity_id):
        """Translate registry exceptions into the API's 400/404 contract."""

        try:
            return CommentTargetRegistry.resolve(entity_type, entity_id)
        except InvalidCommentTargetType as exc:
            raise ValidationError({"entity_type": str(exc)})
        except (CommentTargetNotFound, Http404):
            raise NotFound("Comment target not found.")

    def _get_entity_type(self, target):
        """Cache the public entity type for serializers after detail permission checks."""

        if target is None:
            return None
        try:
            return CommentTargetRegistry.get_entity_type_for_instance(target)
        except InvalidCommentTargetType:
            return None
