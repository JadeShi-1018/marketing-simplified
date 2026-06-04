from dataclasses import dataclass
from typing import Optional

from rest_framework.exceptions import PermissionDenied

from comments.models import CommentAttachment
from comments.permissions import CommentPermissionService


@dataclass(frozen=True)
class CommentAttachmentPreview:
    attachment_id: str
    status: str
    kind: str
    content_type: str
    filename: str
    size: int
    original_file_url: Optional[str]
    preview_pages: list[dict]
    error_message: str


IMAGE_EXTENSIONS = {"gif", "jpeg", "jpg", "png", "svg", "webp"}
VIDEO_EXTENSIONS = {"mov", "mp4", "webm"}
ZIP_EXTENSIONS = {"zip"}
DOCUMENT_EXTENSIONS = {"doc", "docx"}
SPREADSHEET_EXTENSIONS = {"csv", "xls", "xlsx"}
PRESENTATION_EXTENSIONS = {"ppt", "pptx"}
TEXT_EXTENSIONS = {"md", "txt"}


def get_comment_attachment_file_category(attachment: CommentAttachment) -> str:
    content_type = (attachment.content_type or "").lower()
    extension = _get_extension(attachment.filename)

    if content_type.startswith("image/") or extension in IMAGE_EXTENSIONS:
        return "image"
    if content_type == "application/pdf" or extension == "pdf":
        return "pdf"
    if content_type.startswith("video/") or extension in VIDEO_EXTENSIONS:
        return "video"
    if "zip" in content_type or extension in ZIP_EXTENSIONS:
        return "zip"
    if content_type == "text/csv" or extension == "csv":
        return "spreadsheet"
    if content_type.startswith("text/") or extension in TEXT_EXTENSIONS:
        return "text"
    if (
        "spreadsheet" in content_type
        or "excel" in content_type
        or extension in SPREADSHEET_EXTENSIONS
    ):
        return "spreadsheet"
    if "presentation" in content_type or extension in PRESENTATION_EXTENSIONS:
        return "presentation"
    if "word" in content_type or extension in DOCUMENT_EXTENSIONS:
        return "document"
    return "unknown"


def get_comment_attachment_preview(*, attachment, user, request=None):
    if not _can_access_attachment(user=user, attachment=attachment):
        raise PermissionDenied("You do not have access to this attachment.")

    kind = get_comment_attachment_file_category(attachment)
    original_file_url = _build_file_url(attachment=attachment, request=request)
    status = _resolve_preview_status(attachment=attachment, kind=kind)
    preview_pages = _get_preview_pages(
        attachment=attachment,
        kind=kind,
        status=status,
        original_file_url=original_file_url,
        request=request,
    )

    return CommentAttachmentPreview(
        attachment_id=str(attachment.id),
        status=status,
        kind=kind,
        content_type=attachment.content_type,
        filename=attachment.filename,
        size=attachment.size,
        original_file_url=original_file_url if status != CommentAttachment.PREVIEW_UNSUPPORTED else None,
        preview_pages=preview_pages,
        error_message=attachment.preview_error if status == CommentAttachment.PREVIEW_FAILED else "",
    )


def _resolve_preview_status(*, attachment, kind):
    if kind in {"video", "zip"}:
        # ZIP and video attachments are intentionally downloadable-only, not preview-rendered.
        return CommentAttachment.PREVIEW_UNSUPPORTED
    if kind == "image":
        return CommentAttachment.PREVIEW_READY
    if attachment.preview_status in {
        CommentAttachment.PREVIEW_PROCESSING,
        CommentAttachment.PREVIEW_READY,
        CommentAttachment.PREVIEW_FAILED,
    }:
        return attachment.preview_status
    return CommentAttachment.PREVIEW_PENDING


def _get_preview_pages(*, attachment, kind, status, original_file_url, request=None):
    if status != CommentAttachment.PREVIEW_READY:
        return []
    if kind == "image" and original_file_url:
        return [
            {
                "page": 1,
                "image_url": original_file_url,
            }
        ]

    pages = attachment.preview_metadata.get("preview_pages", [])
    if not isinstance(pages, list):
        return []
    return [
        _with_absolute_image_url(page, request=request)
        for page in pages
        if isinstance(page, dict)
    ]


def _can_access_attachment(*, user, attachment):
    if not getattr(user, "is_authenticated", False):
        return False
    if attachment.comment_id is None:
        # Draft uploads are visible only to their uploader until bound to a comment.
        return attachment.uploaded_by_id == getattr(user, "id", None)
    if attachment.comment.deleted_at is not None:
        return False
    target = attachment.comment.content_object
    return target is not None and CommentPermissionService.can_read(user, target)


def _build_file_url(*, attachment, request=None):
    if not attachment.file:
        return None
    url = attachment.file.url
    return request.build_absolute_uri(url) if request else url


def _with_absolute_image_url(page, request=None):
    image_url = page.get("image_url")
    if request and isinstance(image_url, str) and image_url.startswith("/"):
        return {
            **page,
            "image_url": request.build_absolute_uri(image_url),
        }
    return page


def _get_extension(filename):
    extension = filename.rsplit(".", 1)[-1] if "." in filename else ""
    return extension.lower()
