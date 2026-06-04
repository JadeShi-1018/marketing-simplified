from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from comments.services import cleanup_orphan_comment_attachments


class Command(BaseCommand):
    help = "Delete unbound comment attachments older than the configured TTL."

    def add_arguments(self, parser):
        parser.add_argument(
            "--older-than-hours",
            type=float,
            default=24,
            help="Delete unbound uploads older than this many hours. Defaults to 24.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Maximum number of attachments to delete in one run.",
        )

    def handle(self, *args, **options):
        older_than_hours = options["older_than_hours"]
        if older_than_hours <= 0:
            self.stderr.write(self.style.ERROR("--older-than-hours must be greater than 0."))
            return

        cutoff = timezone.now() - timedelta(hours=older_than_hours)
        deleted_count = cleanup_orphan_comment_attachments(
            older_than=cutoff,
            limit=options["limit"],
        )
        self.stdout.write(
            self.style.SUCCESS(
                "Deleted "
                f"{deleted_count} orphan comment attachment(s) older than "
                f"{older_than_hours:g}h."
            )
        )
