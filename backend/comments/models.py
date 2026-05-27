import uuid

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils import timezone


class ActiveCommentQuerySet(models.QuerySet):
    """Query helpers for separating visible comments from soft-deleted records."""

    def alive(self):
        return self.filter(deleted_at__isnull=True)

    def deleted(self):
        return self.filter(deleted_at__isnull=False)


class ActiveCommentManager(models.Manager.from_queryset(ActiveCommentQuerySet)):
    """Default manager that makes deleted comments disappear from normal API reads."""

    def get_queryset(self):
        return super().get_queryset().alive()


class Comment(models.Model):
    """
    Generic comment attached to any registered business entity.

    ContentType/object_id keeps the comments app decoupled from task-specific
    models while still allowing strict target-level permission checks.
    """

    BODY_FORMAT_RICH_TEXT_JSON = "rich_text_json"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    object_id = models.CharField(max_length=255)
    content_object = GenericForeignKey("content_type", "object_id")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="comments",
    )
    body = models.JSONField(default=dict)
    body_text = models.TextField(blank=True)
    body_format = models.CharField(
        max_length=50,
        default=BODY_FORMAT_RICH_TEXT_JSON,
    )
    metadata = models.JSONField(default=dict, blank=True)
    is_edited = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deleted_comments",
    )

    objects = ActiveCommentManager()
    # all_objects is intentionally explicit so admin/tests/services can inspect tombstones.
    all_objects = models.Manager.from_queryset(ActiveCommentQuerySet)()

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["content_type", "object_id", "deleted_at", "created_at"],
                name="comment_target_alive_idx",
            ),
            models.Index(fields=["author", "created_at"], name="comment_author_idx"),
        ]

    def __str__(self):
        return f"Comment {self.id} on {self.content_type_id}:{self.object_id}"


class CommentMention(models.Model):
    """Structured mention relation used for validation, search, and notifications."""

    comment = models.ForeignKey(
        Comment,
        on_delete=models.CASCADE,
        related_name="mentions",
    )
    mentioned_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comment_mentions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["comment", "mentioned_user"]
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["mentioned_user", "created_at"], name="comment_mention_user_idx"),
        ]

    def __str__(self):
        return f"Mention {self.mentioned_user_id} in comment {self.comment_id}"


def comment_attachment_upload_to(instance, filename):
    """Store comment uploads by date to avoid large flat media directories."""

    now = timezone.now()
    return f"comments/attachments/{now:%Y/%m/%d}/{filename}"


class CommentAttachment(models.Model):
    """
    File uploaded before being bound to a comment.

    The nullable comment FK supports the upload-and-bind flow: files are uploaded
    first, then atomically associated with a comment create/update operation.
    """

    PREVIEW_UNSUPPORTED = "unsupported"
    PREVIEW_PENDING = "pending"
    PREVIEW_PROCESSING = "processing"
    PREVIEW_READY = "ready"
    PREVIEW_FAILED = "failed"
    PREVIEW_STATUS_CHOICES = [
        (PREVIEW_UNSUPPORTED, "Unsupported"),
        (PREVIEW_PENDING, "Pending"),
        (PREVIEW_PROCESSING, "Processing"),
        (PREVIEW_READY, "Ready"),
        (PREVIEW_FAILED, "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField(upload_to=comment_attachment_upload_to, max_length=500)
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100, blank=True)
    size = models.PositiveIntegerField(default=0)
    preview_status = models.CharField(
        max_length=20,
        choices=PREVIEW_STATUS_CHOICES,
        default=PREVIEW_PENDING,
    )
    preview_error = models.TextField(blank=True)
    preview_metadata = models.JSONField(default=dict, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comment_attachments",
    )
    comment = models.ForeignKey(
        Comment,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="attachments",
    )
    is_inline = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["uploaded_by", "comment", "created_at"], name="comment_attach_user_idx"),
        ]

    @property
    def is_bound(self):
        return self.comment_id is not None

    def __str__(self):
        return f"Attachment {self.id}: {self.filename}"
