"""
Unit tests for stripe_meta/services.py quota functions and cross-org charging.

Covers:
  - resolve_charging_org: cross-org charging, fail-closed orphan project
  - reserve_quota / commit_quota / release_quota accounting (F() accumulation)
  - check_quota_or_402: Free hard-block, Team metered pass, overage accumulation
"""
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model

from core.models import Organization, Project
from agent.models import AgentSession
from stripe_meta.models import Plan, Subscription, UsageMonthly
from stripe_meta.services import (
    resolve_charging_org,
    reserve_quota,
    commit_quota,
    release_quota,
    check_quota_or_402,
)
from stripe_meta.exceptions import QuotaError

User = get_user_model()


# ── Cross-org charging (most critical) ────────────────────────────────────────

class CrossOrgChargingTests(TestCase):
    """
    resolve_charging_org reads from session.project.organization, NOT from
    user.organization. Tests here don't need any Plan/Subscription — only
    orgs, projects, and sessions.
    Plans are deleted first so the auto-subscribe signal is a no-op.
    """

    def setUp(self):
        Plan.objects.all().delete()

        self.org_a = Organization.objects.create(name='CrossOrgA')
        self.org_b = Organization.objects.create(name='CrossOrgB')

        self.user = User.objects.create_user(
            email='cross@test.com', username='crossuser', password='pw'
        )
        self.user.organization = self.org_a
        self.user.save()

        self.project_a = Project.objects.create(
            name='ProjA', organization=self.org_a, owner=self.user
        )
        self.project_b = Project.objects.create(
            name='ProjB', organization=self.org_b, owner=self.user
        )
        self.session_a = AgentSession.objects.create(user=self.user, project=self.project_a)
        self.session_b = AgentSession.objects.create(user=self.user, project=self.project_b)

    def test_cross_org_quota_charging(self):
        """
        User belongs to OrgA but session.project belongs to OrgB.
        resolve_charging_org must return OrgB — never OrgA.
        """
        org = resolve_charging_org(self.session_b)
        self.assertEqual(org.id, self.org_b.id)
        self.assertNotEqual(org.id, self.org_a.id)

    def test_orphan_project_fail_closed(self):
        """
        project.organization=None → QuotaError(code='PROJECT_HAS_NO_ORG').
        Must NOT fall back to user.organization.
        """
        self.project_a.organization = None
        self.project_a.save()

        with self.assertRaises(QuotaError) as cm:
            resolve_charging_org(self.session_a)

        self.assertEqual(cm.exception.code, 'PROJECT_HAS_NO_ORG')

    def test_none_session_fail_closed(self):
        """None session → QuotaError(code='PROJECT_HAS_NO_ORG')."""
        with self.assertRaises(QuotaError) as cm:
            resolve_charging_org(None)
        self.assertEqual(cm.exception.code, 'PROJECT_HAS_NO_ORG')


# ── Quota accounting: reserve / commit / release ──────────────────────────────

class QuotaAccountingTests(TestCase):
    """
    reserve/commit/release arithmetic. Plans are deleted first (signal no-op),
    then the needed Plan + Subscription are created after the org.
    """

    def setUp(self):
        Plan.objects.all().delete()

        self.org = Organization.objects.create(name='AcctOrg')
        self.plan = Plan.objects.create(
            name='AcctPlan',
            monthly_token_quota=10_000_000,
            base_price_cents=0,
        )
        Subscription.objects.create(
            organization=self.org,
            plan=self.plan,
            stripe_subscription_id=f'sub_acct_{self.org.id}',
            start_date=timezone.now(),
            end_date=timezone.now().replace(year=2099),
            is_active=True,
            is_internal=True,
        )

    def _usage(self):
        ym = timezone.now().strftime('%Y-%m')
        return UsageMonthly.objects.filter(organization=self.org, year_month=ym).first()

    def test_reserve_then_commit_clears_reservation(self):
        """reserve(5000) → commit(actual=3000, reserved=5000) → used=3000, reserved=0."""
        reserve_quota(self.org, 5000)
        row = self._usage()
        self.assertEqual(row.tokens_reserved, 5000)

        commit_quota(self.org, actual_tokens=3000, reserved_tokens=5000)
        row.refresh_from_db()
        self.assertEqual(row.tokens_used, 3000)
        self.assertEqual(row.tokens_reserved, 0)

    def test_release_on_failure_clears_reservation(self):
        """reserve(5000) then release(5000) → reserved=0, used unchanged at 0."""
        reserve_quota(self.org, 5000)
        release_quota(self.org, 5000)
        row = self._usage()
        self.assertEqual(row.tokens_reserved, 0)
        self.assertEqual(row.tokens_used, 0)

    def test_concurrent_reserve_f_expression_accumulates(self):
        """
        Two successive reserve calls must accumulate (F() expression, not overwrite).
        1000 + 2000 = 3000, not 2000.
        """
        reserve_quota(self.org, 1000)
        reserve_quota(self.org, 2000)
        row = self._usage()
        self.assertEqual(row.tokens_reserved, 3000)

    def test_reserve_returns_year_month(self):
        """reserve_quota must return the month the reservation landed in."""
        ym = reserve_quota(self.org, 5000)
        self.assertEqual(ym, timezone.now().strftime('%Y-%m'))

    def test_commit_with_reserved_month_survives_month_boundary(self):
        """
        M-5 regression: a call spanning midnight on the 1st — reserve in month A,
        clock rolls to month B, commit runs. With year_month threaded through,
        commit must reconcile month A's row; month B must not be created/touched
        (the old recomputed-ym code raised DoesNotExist, released against month B
        driving it negative, and leaked month A's reservation).
        """
        from unittest.mock import patch
        from datetime import timedelta

        reserved_ym = reserve_quota(self.org, 5000)

        # Roll the clock into the next month for everything inside services.py.
        next_month = (timezone.now().replace(day=1) + timedelta(days=32)).replace(day=1)
        with patch('stripe_meta.services.timezone.now', return_value=next_month):
            commit_quota(self.org, actual_tokens=3000, reserved_tokens=5000, year_month=reserved_ym)

        row = UsageMonthly.objects.get(organization=self.org, year_month=reserved_ym)
        self.assertEqual(row.tokens_used, 3000)
        self.assertEqual(row.tokens_reserved, 0)
        # No row for the new month was created.
        self.assertEqual(
            UsageMonthly.objects.filter(organization=self.org).count(), 1,
        )

    def test_release_with_reserved_month_survives_month_boundary(self):
        """release_quota with the reserved month must clear THAT month's reservation
        even when the clock has rolled into the next month."""
        from unittest.mock import patch
        from datetime import timedelta

        reserved_ym = reserve_quota(self.org, 5000)

        next_month = (timezone.now().replace(day=1) + timedelta(days=32)).replace(day=1)
        with patch('stripe_meta.services.timezone.now', return_value=next_month):
            release_quota(self.org, 5000, year_month=reserved_ym)

        row = UsageMonthly.objects.get(organization=self.org, year_month=reserved_ym)
        self.assertEqual(row.tokens_reserved, 0)
        self.assertEqual(row.tokens_used, 0)
        self.assertEqual(UsageMonthly.objects.filter(organization=self.org).count(), 1)


# ── check_quota_or_402 enforcement ────────────────────────────────────────────

class QuotaEnforcementTests(TestCase):
    """
    check_quota_or_402 enforcement.  Plans deleted first (signal no-op), then
    re-created explicitly after orgs so we control all field values.
    """

    def setUp(self):
        Plan.objects.all().delete()

        self.org = Organization.objects.create(name='EnforcedOrg')
        self.user = User.objects.create_user(
            email='enforce@test.com', username='enforceuser', password='pw'
        )

        self.free_plan = Plan.objects.create(
            name='EnforceFree',
            monthly_token_quota=500_000,
            max_tokens_per_call=50_000,
            base_price_cents=0,
            # overage_price_cents_per_1m is None by default → hard block
        )
        self.team_plan = Plan.objects.create(
            name='EnforceTeam',
            monthly_token_quota=1_000,
            overage_price_cents_per_1m=500,
            base_price_cents=4900,
        )

    def _free_sub(self):
        return Subscription.objects.create(
            organization=self.org,
            plan=self.free_plan,
            stripe_subscription_id=f'sub_free_{self.org.id}',
            start_date=timezone.now(),
            end_date=timezone.now().replace(year=2099),
            is_active=True,
            is_internal=True,
        )

    def _team_sub(self):
        Subscription.objects.filter(organization=self.org).update(is_active=False)
        return Subscription.objects.create(
            organization=self.org,
            plan=self.team_plan,
            stripe_subscription_id=f'sub_team_{self.org.id}',
            start_date=timezone.now(),
            end_date=timezone.now().replace(year=2099),
            is_active=True,
            is_internal=False,
        )

    def _set_used(self, tokens_used, tokens_reserved=0):
        ym = timezone.now().strftime('%Y-%m')
        UsageMonthly.objects.update_or_create(
            organization=self.org, year_month=ym,
            defaults={'tokens_used': tokens_used, 'tokens_reserved': tokens_reserved},
        )

    def _usage(self):
        ym = timezone.now().strftime('%Y-%m')
        return UsageMonthly.objects.get(organization=self.org, year_month=ym)

    # ── Free plan ──────────────────────────────────────────────────────────

    def test_free_plan_blocks_when_at_quota(self):
        """Free: tokens_used == quota → blocked with TOKEN_QUOTA_EXCEEDED."""
        self._free_sub()
        self._set_used(500_000)

        allowed, payload = check_quota_or_402(self.org, 1)

        self.assertFalse(allowed)
        self.assertEqual(payload['code'], 'TOKEN_QUOTA_EXCEEDED')
        self.assertIn('limit', payload)
        self.assertIn('current_usage', payload)
        self.assertIn('upgrade_url', payload)

    def test_free_plan_passes_when_under_quota(self):
        """Free: usage well below quota → (True, None)."""
        self._free_sub()
        self._set_used(100_000)

        allowed, payload = check_quota_or_402(self.org, 1_000)

        self.assertTrue(allowed)
        self.assertIsNone(payload)

    def test_reserved_tokens_count_toward_used_in_check(self):
        """
        tokens_used + tokens_reserved is what check_quota_or_402 uses.
        used=490_000, reserved=10_001 → total 500_001 > quota 500_000 → blocked.
        """
        self._free_sub()
        self._set_used(tokens_used=490_000, tokens_reserved=10_001)

        allowed, payload = check_quota_or_402(self.org, 1)

        self.assertFalse(allowed)
        self.assertEqual(payload['code'], 'TOKEN_QUOTA_EXCEEDED')

    # ── Team plan ─────────────────────────────────────────────────────────

    def test_team_plan_allows_over_quota(self):
        """Team (metered overage): past quota → (True, None), NOT blocked."""
        self._team_sub()
        self._set_used(1_000)  # exactly at quota

        allowed, payload = check_quota_or_402(self.org, 500)

        self.assertTrue(allowed)
        self.assertIsNone(payload)

    def test_team_plan_accumulates_overage_tokens_on_commit(self):
        """
        commit_quota past quota increments overage_tokens correctly.
        before_used=800, quota=1000, actual=400
        → new_used=1200, overage_delta = max(0, 1200 - max(800, 1000)) = 200
        """
        self._team_sub()
        self._set_used(tokens_used=800)

        reserve_quota(self.org, 400)
        commit_quota(self.org, actual_tokens=400, reserved_tokens=400)

        row = self._usage()
        self.assertEqual(row.tokens_used, 1200)
        self.assertEqual(row.tokens_reserved, 0)
        self.assertEqual(row.overage_tokens, 200)

    # ── No subscription ────────────────────────────────────────────────────

    def test_no_subscription_does_not_block(self):
        """Org with no subscription → check passes (fail-open for unsubscribed orgs)."""
        allowed, payload = check_quota_or_402(self.org, 99_999)

        self.assertTrue(allowed)
        self.assertIsNone(payload)

    # ── Sentinel vs. real subscription ─────────────────────────────────────

    def test_paid_org_not_limited_as_free(self):
        """
        Paid org has both an active Free sentinel (is_internal=True) and an active
        real Team subscription (is_internal=False). check_quota_or_402 must read the
        Team plan (overage allowed), NOT the Free sentinel (hard block).

        Regression: .first() without order_by returned the Free sentinel (lowest PK)
        so paid orgs were blocked at the 500-token Free quota.
        Fix: get_active_real_subscription orders by is_internal so False wins.
        """
        # Create sentinel first so it gets a lower PK (simulates post-upgrade state
        # before Bug 1 Layer A fix runs; both subs are active simultaneously).
        Subscription.objects.create(
            organization=self.org,
            plan=self.free_plan,
            stripe_subscription_id='sub_sentinel_coexist',
            start_date=timezone.now(),
            end_date=timezone.now().replace(year=2099),
            is_active=True,
            is_internal=True,
        )
        Subscription.objects.create(
            organization=self.org,
            plan=self.team_plan,
            stripe_subscription_id='sub_real_coexist',
            start_date=timezone.now(),
            end_date=timezone.now().replace(year=2099),
            is_active=True,
            is_internal=False,
        )
        # Push usage past the Free quota but within Team overage territory
        self._set_used(tokens_used=600_000)

        allowed, payload = check_quota_or_402(self.org, 1_000)

        self.assertTrue(allowed, "Paid org should not be blocked by Free sentinel quota")
        self.assertIsNone(payload)
