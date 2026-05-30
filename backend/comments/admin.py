from django.contrib import admin

from comments.models import Comment, CommentAttachment, CommentMention


class CommentMentionInline(admin.TabularInline):
    """Inline view for the structured users mentioned by a comment."""

    model = CommentMention
    extra = 0
    autocomplete_fields = ["mentioned_user"]


class CommentAttachmentInline(admin.TabularInline):
    """Inline view for files currently bound to a comment."""

    model = CommentAttachment
    extra = 0
    readonly_fields = [
        "id",
        "preview_status",
        "preview_error",
        "preview_metadata",
        "created_at",
    ]
    autocomplete_fields = ["uploaded_by"]


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    """Admin surface includes soft-deleted records for operational visibility."""

    list_display = ["id", "content_type", "object_id", "author", "created_at", "deleted_at"]
    list_filter = ["content_type", "body_format", "deleted_at", "created_at"]
    search_fields = ["id", "object_id", "body_text", "author__email", "author__username"]
    readonly_fields = ["id", "created_at", "updated_at"]
    autocomplete_fields = ["author", "deleted_by"]
    inlines = [CommentMentionInline, CommentAttachmentInline]

    def get_queryset(self, request):
        # The default manager hides deleted comments, but admins need tombstone visibility.
        return Comment.all_objects.select_related("author", "content_type", "deleted_by")


@admin.register(CommentAttachment)
class CommentAttachmentAdmin(admin.ModelAdmin):
    """Admin surface for uploaded files, including unbound staged attachments."""

    list_display = [
        "id",
        "filename",
        "uploaded_by",
        "comment",
        "size",
        "content_type",
        "preview_status",
        "created_at",
    ]
    list_filter = ["content_type", "preview_status", "is_inline", "created_at"]
    search_fields = ["id", "filename", "uploaded_by__email", "uploaded_by__username"]
    readonly_fields = ["id", "created_at"]
    autocomplete_fields = ["uploaded_by", "comment"]


@admin.register(CommentMention)
class CommentMentionAdmin(admin.ModelAdmin):
    """Admin surface for inspecting mention rows independently."""

    list_display = ["comment", "mentioned_user", "created_at"]
    search_fields = ["comment__id", "mentioned_user__email", "mentioned_user__username"]
    readonly_fields = ["created_at"]
    autocomplete_fields = ["comment", "mentioned_user"]
