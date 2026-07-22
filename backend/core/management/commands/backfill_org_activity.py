"""
Management command: backfill_org_activity

Creates historical member_joined OrganizationActivityEvent records from existing
OrganizationMembership rows that have no corresponding event yet.

Usage:
    python manage.py backfill_org_activity
    python manage.py backfill_org_activity --dry-run
"""

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Backfill member_joined activity events from existing OrganizationMembership records"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help="Print what would be created without actually writing to the database",
        )

    def handle(self, *args, **options):
        from core.models import OrganizationActivityEvent, OrganizationMembership  # noqa: PLC0415

        dry_run = options['dry_run']

        memberships = (
            OrganizationMembership.objects.select_related('user', 'organization', 'invited_by')
            .filter(is_active=True)
            .order_by('joined_at')
        )

        created_count = 0
        skipped_count = 0

        for membership in memberships:
            # Check if there's already a member_joined event for this user in this org
            already_exists = OrganizationActivityEvent.objects.filter(
                organization=membership.organization,
                event_type='member_joined',
                target_user=membership.user,
            ).exists()

            if already_exists:
                skipped_count += 1
                continue

            if dry_run:
                self.stdout.write(
                    f"[DRY-RUN] Would create member_joined: "
                    f"{membership.user.email} @ {membership.organization.name} "
                    f"(role={membership.role}, joined={membership.joined_at})"
                )
                created_count += 1
                continue

            with transaction.atomic():
                event = OrganizationActivityEvent(
                    organization=membership.organization,
                    event_type='member_joined',
                    actor=membership.invited_by,
                    target_user=membership.user,
                    metadata={
                        'role': membership.role,
                        'via': 'backfill',
                    },
                )
                # Manually set created_at to match join time for historical accuracy
                event.save()
                OrganizationActivityEvent.objects.filter(pk=event.pk).update(
                    created_at=membership.joined_at,
                )
                created_count += 1

        prefix = "[DRY-RUN] " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix}Done. Created {created_count} events, skipped {skipped_count} (already had events)."
            )
        )
