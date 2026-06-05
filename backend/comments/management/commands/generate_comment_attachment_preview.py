from django.core.management.base import BaseCommand, CommandError

from comments.models import CommentAttachment
from comments.preview_generation import generate_comment_attachment_preview


class Command(BaseCommand):
    help = "Generate preview pages for a comment attachment."

    def add_arguments(self, parser):
        parser.add_argument("attachment_id")

    def handle(self, *args, **options):
        attachment_id = options["attachment_id"]
        try:
            attachment = CommentAttachment.objects.get(pk=attachment_id)
        except CommentAttachment.DoesNotExist as exc:
            raise CommandError(f"Comment attachment {attachment_id} was not found.") from exc

        attachment = generate_comment_attachment_preview(attachment)
        self.stdout.write(
            self.style.SUCCESS(
                f"Preview generation finished for {attachment.id}: {attachment.preview_status}"
            )
        )
