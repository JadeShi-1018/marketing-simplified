"""
migrate_legacy_subscribers — one-shot command to move Pro/Ultimate subscribers to Team.

Steps per subscriber:
  1. stripe.Subscription.modify  — apply grandfather coupon, no proration
  2. Update local Subscription row  — plan=Team, seat_count=current org member count
  3. _notify_org_migration         — email + in-app notification to each org member

Idempotency: subscriptions are queried by plan__name__in=['Pro','Ultimate'].
After a successful run the rows are on Team plan, so a second run finds nothing.

Safety flags:
  --dry-run   Print what would happen without touching the DB or Stripe.
"""
from __future__ import annotations

import logging

import stripe
from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand
from django.db import transaction

from notifications.models import NotificationCategory, NotificationEventType
from notifications.services import create_notification
from stripe_meta.models import Plan, Subscription

logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY

LEGACY_PLAN_NAMES = ['Pro', 'Ultimate']


def _notify_org_migration(org, old_plan_name: str) -> None:
    """Email + in-app notification to every active member of *org*."""
    coupon_id = getattr(settings, 'LEGACY_MIGRATION_COUPON_ID', '')
    title = 'Your plan has been upgraded to Team'
    body = (
        f'Your {old_plan_name} plan has been migrated to the new Team plan '
        f'with a grandfather discount ({coupon_id}) applied. '
        'You now have 5 million tokens per month, '
        'plus metered overage for usage beyond the base quota.'
    )
    plans_url = f"{getattr(settings, 'FRONTEND_URL', '')}/plans"

    for user in org.users.filter(is_active=True):
        try:
            send_mail(
                subject=title,
                message=(
                    f'Hi {user.first_name or user.username},\n\n'
                    f'{body}\n\n'
                    f'Review your plan at: {plans_url}\n\n'
                    'The Marketing Simplified Team'
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception:
            logger.exception('_notify_org_migration: email failed for user=%s', user.id)

        try:
            create_notification(
                recipient_id=user.id,
                actor_id=None,
                category=NotificationCategory.SYSTEM,
                event_type=NotificationEventType.BILLING_ANOMALY,
                title=title,
                body=body,
                action_url='/plans',
            )
        except Exception:
            logger.exception('_notify_org_migration: in-app failed for user=%s', user.id)


class Command(BaseCommand):
    help = 'Migrate Pro/Ultimate subscribers to the Team plan with a grandfather coupon.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be migrated without writing any data.',
        )

    def handle(self, *args, **options):
        dry_run: bool = options['dry_run']
        coupon_id: str = getattr(settings, 'LEGACY_MIGRATION_COUPON_ID', '')

        try:
            team_plan = Plan.objects.get(name='Team', is_archived=False)
        except Plan.DoesNotExist:
            self.stderr.write(self.style.ERROR(
                'Team plan not found. Run `python manage.py migrate` first.'
            ))
            return
        except Plan.MultipleObjectsReturned:
            self.stderr.write(self.style.ERROR(
                'Multiple active Team plans found — fix the data before migrating.'
            ))
            return

        subs = (
            Subscription.objects
            .filter(is_active=True, is_internal=False, plan__name__in=LEGACY_PLAN_NAMES)
            .select_related('plan', 'organization')
        )

        if not subs.exists():
            self.stdout.write(self.style.SUCCESS(
                'No legacy subscribers found — nothing to migrate.'
            ))
            if not dry_run:
                self._archive_legacy_plans()
            return

        migrated = 0
        for sub in subs:
            org = sub.organization
            old_plan_name = sub.plan.name
            seat_count = max(1, org.users.filter(is_active=True).count())

            self.stdout.write(
                f'[{"DRY-RUN" if dry_run else "MIGRATE"}]'
                f'  org={org.id} ({org.name})'
                f'  plan: {old_plan_name} → Team'
                f'  seats: {seat_count}'
                f'  stripe_sub: {sub.stripe_subscription_id}'
            )

            if dry_run:
                continue

            try:
                with transaction.atomic():
                    stripe.Subscription.modify(
                        sub.stripe_subscription_id,
                        coupon=coupon_id,
                        proration_behavior='none',
                    )
                    sub.plan = team_plan
                    sub.seat_count = seat_count
                    sub.save(update_fields=['plan', 'seat_count'])

                _notify_org_migration(org, old_plan_name)
                migrated += 1
                self.stdout.write(self.style.SUCCESS(
                    f'  ✓ org={org.id} migrated successfully'
                ))
            except Exception:
                logger.exception(
                    'migrate_legacy_subscribers: failed for org=%s sub=%s',
                    org.id, sub.stripe_subscription_id,
                )
                self.stderr.write(self.style.ERROR(
                    f'  ✗ org={org.id} failed — see logs for details'
                ))

        if not dry_run:
            archived = self._archive_legacy_plans()
            self.stdout.write(self.style.SUCCESS(
                f'Migration complete: {migrated} subscription(s) migrated, '
                f'{archived} legacy plan(s) archived.'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'Dry-run complete: {subs.count()} subscription(s) would be migrated.'
            ))

    def _archive_legacy_plans(self) -> int:
        archived = Plan.objects.filter(name__in=LEGACY_PLAN_NAMES).update(is_archived=True)
        if archived:
            self.stdout.write(self.style.SUCCESS(
                f'Archived {archived} legacy plan(s): {", ".join(LEGACY_PLAN_NAMES)}.'
            ))
        return archived
