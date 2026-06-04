from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from decision.models import Decision

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Soft-delete DRAFT decisions for local QA cleanup. "
        "Use --project-id to scope, or --all-my-drafts with --user-email."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--project-id",
            dest="project_ids",
            action="append",
            type=int,
            help="Limit to one or more project IDs. Can be repeated.",
        )
        parser.add_argument(
            "--user-email",
            type=str,
            help="With --all-my-drafts, only drafts authored by this user.",
        )
        parser.add_argument(
            "--all-my-drafts",
            action="store_true",
            help="Soft-delete all DRAFT decisions for --user-email across projects.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print decisions that would be deleted without writing.",
        )

    def handle(self, *args, **options):
        project_ids: list[int] | None = options.get("project_ids")
        all_my_drafts: bool = options["all_my_drafts"]
        user_email: str | None = options.get("user_email")
        dry_run: bool = options["dry_run"]

        if not project_ids and not all_my_drafts:
            raise CommandError("Provide --project-id and/or --all-my-drafts.")

        qs = Decision.objects.filter(is_deleted=False, status=Decision.Status.DRAFT)

        if project_ids:
            qs = qs.filter(project_id__in=project_ids)

        if all_my_drafts:
            if not user_email:
                raise CommandError("--all-my-drafts requires --user-email.")
            try:
                user = User.objects.get(email=user_email)
            except User.DoesNotExist as exc:
                raise CommandError(f"User not found: {user_email}") from exc
            qs = qs.filter(author=user)

        count = qs.count()
        if count == 0:
            self.stdout.write(self.style.WARNING("No matching DRAFT decisions found."))
            return

        preview = list(qs.values_list("id", "project_id", "title")[:20])
        for decision_id, project_id, title in preview:
            self.stdout.write(f"  id={decision_id} project_id={project_id} title={title!r}")
        if count > len(preview):
            self.stdout.write(f"  … and {count - len(preview)} more")

        if dry_run:
            self.stdout.write(self.style.WARNING(f"Dry run: would soft-delete {count} decision(s)."))
            return

        updated = qs.update(is_deleted=True)
        self.stdout.write(self.style.SUCCESS(f"Soft-deleted {updated} DRAFT decision(s)."))
