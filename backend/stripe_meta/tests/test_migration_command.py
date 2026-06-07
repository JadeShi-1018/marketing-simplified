"""
Unit tests for commit 16: migrate_legacy_subscribers management command.

Mock boundaries:
  stripe_meta.management.commands.migrate_legacy_subscribers.stripe.Subscription.modify
  stripe_meta.management.commands.migrate_legacy_subscribers._notify_org_migration

setUp pattern: Plan.objects.all().delete() before org creation so the
post_save signal (Free plan auto-subscription) silently skips.
"""
from datetime import timedelta
from io import StringIO
from unittest.mock import patch, call

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from core.models import Organization
from stripe_meta.models import Plan, Subscription

User = get_user_model()

MODIFY_PATH = (
    'stripe_meta.management.commands'
    '.migrate_legacy_subscribers.stripe.Subscription.modify'
)
NOTIFY_PATH = (
    'stripe_meta.management.commands'
    '.migrate_legacy_subscribers._notify_org_migration'
)
TEST_COUPON = 'coupon_grandfather_test'


class MigrationTestBase(TestCase):
    """
    Three plans (Pro, Ultimate, Team).
    One org with 2 active members and one active Pro subscription.
    """

    def setUp(self):
        # Delete all plans so the Organization post_save signal is a no-op
        # (it looks for Plan(name='Free') which won't exist).
        Plan.objects.all().delete()

        self.org = Organization.objects.create(name='Legacy Org', slug='legacy-org')

        self.user1 = User.objects.create_user(
            email='u1@legacy.com', username='leguser1', password='pw',
        )
        self.user1.organization = self.org
        self.user1.save()

        self.user2 = User.objects.create_user(
            email='u2@legacy.com', username='leguser2', password='pw',
        )
        self.user2.organization = self.org
        self.user2.save()

        self.team_plan = Plan.objects.create(
            name='Team',
            stripe_price_id='price_team_mig',
            base_price_cents=4900,
            monthly_token_quota=5_000_000,
        )
        self.pro_plan = Plan.objects.create(
            name='Pro',
            stripe_price_id='price_pro_mig',
            base_price_cents=2900,
        )
        self.ultimate_plan = Plan.objects.create(
            name='Ultimate',
            stripe_price_id='price_ultimate_mig',
            base_price_cents=9900,
        )

        self.sub = Subscription.objects.create(
            organization=self.org,
            plan=self.pro_plan,
            stripe_subscription_id='sub_pro_legacy_001',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=365),
            is_active=True,
            is_internal=False,
            seat_count=1,
        )


@override_settings(LEGACY_MIGRATION_COUPON_ID=TEST_COUPON)
class MigrateLegacyCommandTests(MigrationTestBase):

    @patch(NOTIFY_PATH)
    @patch(MODIFY_PATH)
    def test_migrate_legacy_dry_run(self, mock_modify, mock_notify):
        """--dry-run: no DB writes, Stripe not called, plans not archived."""
        out = StringIO()
        call_command('migrate_legacy_subscribers', '--dry-run', stdout=out)

        # Stripe must not be touched
        mock_modify.assert_not_called()
        mock_notify.assert_not_called()

        # Sub still on Pro
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.plan.name, 'Pro')

        # Old plans still live
        self.assertFalse(Plan.objects.get(name='Pro').is_archived)
        self.assertFalse(Plan.objects.get(name='Ultimate').is_archived)

        # Output must mention DRY-RUN
        self.assertIn('DRY-RUN', out.getvalue())

    @patch(NOTIFY_PATH)
    @patch(MODIFY_PATH)
    def test_migrate_legacy_real(self, mock_modify, mock_notify):
        """Real run: plan→Team, seat_count=member_count, Stripe called with coupon."""
        out = StringIO()
        call_command('migrate_legacy_subscribers', stdout=out)

        # Stripe.modify called once with correct positional + keyword args
        mock_modify.assert_called_once_with(
            'sub_pro_legacy_001',
            coupon=TEST_COUPON,
            proration_behavior='none',
        )

        # Notify called for this org
        mock_notify.assert_called_once()
        call_org, call_old_plan = mock_notify.call_args[0]
        self.assertEqual(call_org.id, self.org.id)
        self.assertEqual(call_old_plan, 'Pro')

        # Sub now on Team with correct seat count
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.plan.name, 'Team')
        self.assertEqual(self.sub.seat_count, 2)  # 2 active users in org

    @patch(NOTIFY_PATH)
    @patch(MODIFY_PATH)
    def test_migrate_legacy_idempotent(self, mock_modify, mock_notify):
        """Second run finds no legacy subs → modify called exactly once total."""
        call_command('migrate_legacy_subscribers')
        call_command('migrate_legacy_subscribers')

        # First run migrated the sub; second run found nothing
        mock_modify.assert_called_once()

    @patch(NOTIFY_PATH)
    @patch(MODIFY_PATH)
    def test_migrate_legacy_archives_old_plans(self, mock_modify, mock_notify):
        """After successful run, Pro and Ultimate plans are archived; Team is not."""
        call_command('migrate_legacy_subscribers')

        self.assertTrue(Plan.objects.get(name='Pro').is_archived)
        self.assertTrue(Plan.objects.get(name='Ultimate').is_archived)
        self.assertFalse(Plan.objects.get(name='Team').is_archived)
