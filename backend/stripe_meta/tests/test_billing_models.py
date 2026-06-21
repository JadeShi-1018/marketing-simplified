"""
Unit tests for new model constraints and migration-seeded plan data.

Covers:
  - UniqueConstraint: unique_active_real_subscription_per_org
  - Free sentinel (is_internal=True) is exempt from the constraint
  - Migration 0004 seed values for Free and Team plans
"""
from django.test import TestCase
from django.db import IntegrityError
from django.utils import timezone
from datetime import timedelta

from core.models import Organization
from stripe_meta.models import Plan, Subscription


class UniqueActiveSubscriptionConstraintTests(TestCase):
    """
    The constraint fires only when is_active=True AND is_internal=False.
    Internal (Free sentinel) and inactive rows are unrestricted.
    """

    def setUp(self):
        Plan.objects.all().delete()
        self.org = Organization.objects.create(name='ConstraintOrg')
        self.plan = Plan.objects.create(name='ConstraintPlan')

    def _make_sub(self, org, sub_id, *, is_active=True, is_internal=False):
        return Subscription.objects.create(
            organization=org,
            plan=self.plan,
            stripe_subscription_id=sub_id,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=365),
            is_active=is_active,
            is_internal=is_internal,
        )

    def test_two_active_real_subscriptions_raise_integrity_error(self):
        """
        Two is_active=True, is_internal=False rows for the same org → IntegrityError.
        This is the constraint the UniqueConstraint enforces.
        """
        self._make_sub(self.org, 'sub_first')
        with self.assertRaises(IntegrityError):
            self._make_sub(self.org, 'sub_second')

    def test_free_sentinel_subscriptions_are_not_constrained(self):
        """
        is_internal=True rows (Free sentinels) are exempt from the constraint.
        Two of them for the same org must coexist without error.
        """
        self._make_sub(self.org, 'sub_free_1', is_internal=True)
        self._make_sub(self.org, 'sub_free_2', is_internal=True)  # must not raise
        self.assertEqual(
            Subscription.objects.filter(organization=self.org, is_internal=True).count(), 2
        )

    def test_inactive_subscription_not_constrained(self):
        """is_active=False rows are exempt from the constraint."""
        self._make_sub(self.org, 'sub_inactive', is_active=False)
        self._make_sub(self.org, 'sub_active')  # must not raise
        self.assertEqual(Subscription.objects.filter(organization=self.org).count(), 2)

    def test_different_orgs_can_have_active_real_subscriptions(self):
        """Constraint is per-organization — different orgs each get one active real sub."""
        Plan.objects.all().delete()
        org2 = Organization.objects.create(name='ConstraintOrg2')
        plan = Plan.objects.create(name='ConstraintPlan2')
        for org in (self.org, org2):
            Subscription.objects.create(
                organization=org,
                plan=plan,
                stripe_subscription_id=f'sub_real_{org.id}',
                start_date=timezone.now(),
                end_date=timezone.now() + timedelta(days=365),
                is_active=True,
                is_internal=False,
            )
        self.assertEqual(
            Subscription.objects.filter(is_active=True, is_internal=False).count(), 2
        )


class PlanSeedValuesTest(TestCase):
    """
    Verify migration 0004 seed values for Free and Team plans.
    Does NOT delete plans in setUp — reads what migration applied.
    """

    def test_free_plan_seed_values(self):
        """Free plan: quota=500_000, base=0, max_call=50_000, overage=None."""
        free = Plan.objects.filter(name='Free').first()
        if free is None:
            self.skipTest('Free plan not seeded — ensure all migrations have run')

        self.assertEqual(free.monthly_token_quota, 500_000)
        self.assertEqual(free.max_tokens_per_call, 50_000)
        self.assertEqual(free.base_price_cents, 0)
        self.assertIsNone(free.overage_price_cents_per_1m)  # hard block, no overage
        self.assertFalse(free.is_archived)

    def test_team_plan_seed_values(self):
        """Team plan: quota=5_000_000, base=4900, overage=500, seats=5."""
        team = Plan.objects.filter(name='Team').first()
        if team is None:
            self.skipTest('Team plan not seeded — ensure all migrations have run')

        self.assertEqual(team.monthly_token_quota, 5_000_000)
        self.assertEqual(team.max_tokens_per_call, 500_000)
        self.assertEqual(team.base_price_cents, 4900)
        self.assertEqual(team.overage_price_cents_per_1m, 500)
        self.assertEqual(team.included_seats, 5)
        self.assertEqual(team.extra_seat_price_cents, 900)
        self.assertFalse(team.is_archived)
