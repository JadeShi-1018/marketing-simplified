import logging

from celery import shared_task

from comments.models import CommentAttachment
from comments.preview_generation import generate_comment_attachment_preview

logger = logging.getLogger(__name__)


@shared_task(bind=True, ignore_result=True)
def generate_comment_attachment_preview_task(self, attachment_id):
    try:
        attachment = CommentAttachment.objects.get(pk=attachment_id)
    except CommentAttachment.DoesNotExist:
        logger.warning(
            "Comment attachment preview skipped: attachment %s not found",
            attachment_id,
        )
        return False

    generate_comment_attachment_preview(attachment)
    return True
