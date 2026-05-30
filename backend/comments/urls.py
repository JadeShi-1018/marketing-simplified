from django.urls import path

from comments.views import (
    CommentAttachmentDetailView,
    CommentAttachmentPreviewView,
    CommentAttachmentUploadView,
    CommentCollectionView,
    CommentDetailView,
    CommentMentionUserSearchView,
)

urlpatterns = [
    # Flat routes keep comments reusable across tasks and future entity types.
    path("comments/", CommentCollectionView.as_view(), name="comment-list"),
    path("comments/<uuid:comment_id>/", CommentDetailView.as_view(), name="comment-detail"),
    path(
        "attachments/<uuid:attachment_id>/preview/",
        CommentAttachmentPreviewView.as_view(),
        name="comment-attachment-preview",
    ),
    path(
        "attachments/<uuid:attachment_id>/",
        CommentAttachmentDetailView.as_view(),
        name="comment-attachment-detail",
    ),
    path("attachments/", CommentAttachmentUploadView.as_view(), name="comment-attachment-upload"),
    path("comment-mention-users/", CommentMentionUserSearchView.as_view(), name="comment-mention-users"),
]
