from rest_framework import serializers

from comments.models import Comment, CommentAttachment
from comments.permissions import CommentPermissionService
from comments.registry import CommentTargetRegistry, InvalidCommentTargetType


class UserSummarySerializer(serializers.Serializer):
    """Small user representation shared by comment authors and mentions."""

    id = serializers.IntegerField()
    username = serializers.CharField(allow_blank=True)
    email = serializers.EmailField(allow_blank=True)


class CommentUploadSerializer(serializers.ModelSerializer):
    """Serializer for the upload-first attachment endpoint."""

    entity_type = serializers.CharField(write_only=True)
    entity_id = serializers.CharField(write_only=True)
    file = serializers.FileField(write_only=True)
    file_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CommentAttachment
        fields = [
            "id",
            "entity_type",
            "entity_id",
            "file",
            "filename",
            "content_type",
            "size",
            "file_url",
            "is_inline",
            "metadata",
            "created_at",
        ]
        read_only_fields = ["id", "filename", "content_type", "size", "file_url", "created_at"]

    def create(self, validated_data):
        """Persist file metadata at upload time before later comment binding."""

        validated_data.pop("entity_type", None)
        validated_data.pop("entity_id", None)
        file_obj = validated_data["file"]
        return CommentAttachment.objects.create(
            file=file_obj,
            filename=file_obj.name,
            content_type=getattr(file_obj, "content_type", "") or "",
            size=getattr(file_obj, "size", 0) or 0,
            uploaded_by=self.context["request"].user,
            is_inline=validated_data.get("is_inline", False),
            metadata=validated_data.get("metadata", {}),
        )

    def get_file_url(self, obj):
        """Return an absolute URL when request context is available."""

        if not obj.file:
            return None
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url


class CommentAttachmentPreviewPageSerializer(serializers.Serializer):
    """Per-page preview image metadata."""

    page = serializers.IntegerField(min_value=1)
    image_url = serializers.URLField()
    width = serializers.IntegerField(min_value=1, required=False)
    height = serializers.IntegerField(min_value=1, required=False)


class CommentAttachmentPreviewSerializer(serializers.Serializer):
    """Read-only metadata for frontend attachment preview decisions."""

    attachment_id = serializers.UUIDField()
    status = serializers.ChoiceField(
        choices=[choice[0] for choice in CommentAttachment.PREVIEW_STATUS_CHOICES],
    )
    kind = serializers.CharField()
    content_type = serializers.CharField(allow_blank=True)
    filename = serializers.CharField()
    size = serializers.IntegerField()
    original_file_url = serializers.URLField(allow_null=True)
    preview_pages = CommentAttachmentPreviewPageSerializer(many=True)
    error_message = serializers.CharField(allow_blank=True)


class CommentCreateSerializer(serializers.Serializer):
    """Input contract for creating comments against a registered entity target."""

    entity_type = serializers.CharField()
    entity_id = serializers.CharField()
    body = serializers.JSONField()
    body_format = serializers.ChoiceField(
        choices=[Comment.BODY_FORMAT_RICH_TEXT_JSON],
        required=False,
        default=Comment.BODY_FORMAT_RICH_TEXT_JSON,
    )
    mentions = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        default=list,
    )
    attachment_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list,
    )


class CommentUpdateSerializer(serializers.Serializer):
    """Input contract for partial/full comment updates."""

    body = serializers.JSONField(required=False)
    body_format = serializers.ChoiceField(
        choices=[Comment.BODY_FORMAT_RICH_TEXT_JSON],
        required=False,
    )
    mentions = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
    )
    attachment_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
    )

    def validate(self, attrs):
        """Reject empty updates so services are only called for real mutations."""

        if not attrs:
            raise serializers.ValidationError("At least one field must be provided.")
        return attrs


class CommentResponseSerializer(serializers.ModelSerializer):
    """Canonical response shape for list, detail, create, and update endpoints."""

    entity_type = serializers.SerializerMethodField()
    entity_id = serializers.CharField(source="object_id")
    author = UserSummarySerializer(read_only=True)
    mentions = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id",
            "entity_type",
            "entity_id",
            "author",
            "body",
            "body_text",
            "body_format",
            "mentions",
            "metadata",
            "is_edited",
            "created_at",
            "updated_at",
            "can_edit",
            "can_delete",
        ]

    def get_entity_type(self, obj):
        """Expose the public registry key instead of Django ContentType internals."""

        entity_type = self.context.get("entity_type")
        if entity_type:
            return entity_type

        target = self.context.get("comment_target")
        if target is None:
            target = obj.content_object
        if target is None:
            return None
        try:
            return CommentTargetRegistry.get_entity_type_for_instance(target)
        except InvalidCommentTargetType:
            return None

    def get_mentions(self, obj):
        """Render structured mention rows as user summaries."""

        return [
            UserSummarySerializer(mention.mentioned_user).data
            for mention in obj.mentions.all()
        ]

    def get_can_edit(self, obj):
        """Expose UI affordance state while keeping backend checks authoritative."""

        request = self.context.get("request")
        return bool(
            request and CommentPermissionService.can_update(
                request.user,
                obj,
                target=self.context.get("comment_target"),
            )
        )

    def get_can_delete(self, obj):
        """Expose UI affordance state while keeping backend checks authoritative."""

        request = self.context.get("request")
        return bool(
            request and CommentPermissionService.can_delete(
                request.user,
                obj,
                target=self.context.get("comment_target"),
            )
        )
