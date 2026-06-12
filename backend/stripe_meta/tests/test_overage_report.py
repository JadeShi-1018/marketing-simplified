"""
Unit tests for report_overage_to_stripe Celery task.

The task reports the PREVIOUS (completed) calendar month, delta-based:
overage_reported_tokens tracks tokens already credited to Stripe (units x 1M),
each run reports ceil(unreported delta / 1M) units.

Mock boundary: stripe_meta.tasks.stripe.billing.MeterEvent.create
Uses new Billing Meter Events API only (Stripe 2025-03-31.basil+).
"""
import logging
from datetime import timedelta
from unittest.mock import patch

import stripe
from django.test import TestCase
from django.utils import timezone

from django.contrib.auth import get_user_model

from core.models import Organization
from stripe_meta.models import Plan, Subscription, UsageMonthly
from stripe_meta.tasks import report_overage_to_stripe

User = get_user_model()

METER_EVENT_PATH = 'stripe_meta.tasks.stripe.billing.MeterEvent.create'


def previous_ym() -> str:
    """Previous calendar month in 'YYYY-MM' — same formula as the task."""
    today = timezone.now().date()
    return (today.replace(day=1) - timedelta(days=1)).strftime('%Y-%m')


class OverageReportTestBase(TestCase):
    """
    Team plan with overage pricing, org with stripe_customer_id, one real
    subscription, and a PREVIOUS-month UsageMonthly row (the month the task
    reports). Plan.objects.all().delete() silences the post-save signal.
    """

    def setUp(self):
        Plan.objects.all().delete()

        self.org = Organization.objects.create(
            name='Overage Org', slug='overage-org',
            stripe_customer_id='cus_overage_test',
        )
        self.user = User.objects.create_user(
            email='overage@test.com', username='overageuser', password='pw',
        )
        self.user.organization = self.org
        self.user.save()

        self.plan = Plan.objects.create(
            name='Team',
            stripe_price_id='price_team_base',
            stripe_overage_price_id='price_team_overage',
            overage_price_cents_per_1m=100,
            monthly_token_quota=5_000_000,
            included_seats=3,
            base_price_cents=4900,
        )
        self.subscription = Subscription.objects.create(
            organization=self.org,
            plan=self.plan,
            stripe_subscription_id='sub_team_overage',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30),
            is_active=True,
            is_internal=False,
        )

        self.ym = previous_ym()
        self.usage = UsageMonthly.objects.create(
            organization=self.org,
            year_month=self.ym,
            tokens_used=6_500_000,
            overage_tokens=1_500_000,
        )


class ReportOverageMeterEventTest(OverageReportTestBase):

    def test_report_overage_meter_event(self):
        """
        Prior-month overage_tokens=1_500_000, nothing credited yet →
        units=ceil(1.5)=2; identifier carries the credited baseline (0);
        overage_reported_tokens credited 2M; overage_reported_at set.
        """
        with patch(METER_EVENT_PATH) as mock_create:
            report_overage_to_stripe()

        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args[1]

        self.assertEqual(call_kwargs['event_name'], 'token_overage')
        self.assertEqual(call_kwargs['payload']['value'], '2')
        self.assertEqual(call_kwargs['payload']['stripe_customer_id'], 'cus_overage_test')
        self.assertEqual(
            call_kwargs['identifier'],
            f'{self.org.id}-{self.ym}-overage-0',
        )
        self.assertIn('timestamp', call_kwargs)

        self.usage.refresh_from_db()
        self.assertEqual(self.usage.overage_reported_tokens, 2_000_000)
        self.assertIsNotNone(self.usage.overage_reported_at)

    def test_report_overage_uses_string_value(self):
        """value in MeterEvent.create payload must be str, not int."""
        with patch(METER_EVENT_PATH) as mock_create:
            report_overage_to_stripe()

        payload = mock_create.call_args[1]['payload']
        self.assertIsInstance(payload['value'], str)

    def test_fractional_megatoken_not_billed_as_zero(self):
        """
        999,999 overage tokens must bill 1 unit, not 0 — the old floor division
        silently dropped sub-1M overage entirely ($0 instead of ~$5).
        """
        self.usage.overage_tokens = 999_999
        self.usage.save(update_fields=['overage_tokens'])

        with patch(METER_EVENT_PATH) as mock_create:
            report_overage_to_stripe()

        mock_create.assert_called_once()
        self.assertEqual(mock_create.call_args[1]['payload']['value'], '1')
        self.usage.refresh_from_db()
        self.assertEqual(self.usage.overage_reported_tokens, 1_000_000)


class ReportOverageTargetsPreviousMonthTest(OverageReportTestBase):

    def test_current_month_row_is_not_reported(self):
        """
        The task must target the PREVIOUS month only. A run early in a new month
        (the scheduled case) must not read the current month's row — the old code
        derived ym from the run date, so a 1st-of-month run reported the wrong,
        empty month and the completed month was never reportable.
        """
        # Remove the previous-month row; leave only a current-month row with overage.
        self.usage.delete()
        current_ym = timezone.now().strftime('%Y-%m')
        UsageMonthly.objects.create(
            organization=self.org,
            year_month=current_ym,
            tokens_used=9_000_000,
            overage_tokens=4_000_000,
        )

        with patch(METER_EVENT_PATH) as mock_create:
            report_overage_to_stripe()

        mock_create.assert_not_called()

    def test_previous_month_row_is_reported(self):
        """Sanity: the previous-month row from setUp IS the one reported."""
        with patch(METER_EVENT_PATH) as mock_create:
            report_overage_to_stripe()

        self.assertIn(self.ym, mock_create.call_args[1]['identifier'])


class ReportOverageIdempotencyTest(OverageReportTestBase):

    def test_report_overage_rerun_is_idempotent(self):
        """
        Running the task twice must call MeterEvent.create exactly once —
        after the first run everything is credited, so the delta is <= 0.
        """
        with patch(METER_EVENT_PATH) as mock_create:
            report_overage_to_stripe()
            report_overage_to_stripe()

        mock_create.assert_called_once()

    def test_delta_reported_after_overage_grows(self):
        """
        If overage grows beyond the credited amount after a report, the next run
        reports only the unreported delta with an advanced identifier baseline —
        the old once-and-final overage_reported_at guard dropped this revenue.
        """
        with patch(METER_EVENT_PATH) as mock_create:
            report_overage_to_stripe()   # credits ceil(1.5M) = 2M

            # Late accrual: overage grows to 4.5M (delta vs credited 2M = 2.5M)
            self.usage.refresh_from_db()
            self.usage.overage_tokens = 4_500_000
            self.usage.save(update_fields=['overage_tokens'])

            report_overage_to_stripe()   # must report ceil(2.5M) = 3 units

        self.assertEqual(mock_create.call_count, 2)
        second_kwargs = mock_create.call_args_list[1][1]
        self.assertEqual(second_kwargs['payload']['value'], '3')
        self.assertEqual(
            second_kwargs['identifier'],
            f'{self.org.id}-{self.ym}-overage-2000000',
        )

        self.usage.refresh_from_db()
        self.assertEqual(self.usage.overage_reported_tokens, 5_000_000)

    def test_growth_within_credited_amount_not_rebilled(self):
        """
        Growth that stays within the already-credited (ceiled) amount must not
        trigger another report — the credit model self-corrects rounding.
        """
        with patch(METER_EVENT_PATH) as mock_create:
            report_overage_to_stripe()   # 1.5M → credits 2M

            self.usage.refresh_from_db()
            self.usage.overage_tokens = 1_900_000   # still under the 2M credit
            self.usage.save(update_fields=['overage_tokens'])

            report_overage_to_stripe()

        mock_create.assert_called_once()


class ReportOverageSkipConditionsTest(OverageReportTestBase):

    def test_report_overage_skips_zero(self):
        """overage_tokens=0 → delta 0 → MeterEvent.create must not be called."""
        self.usage.overage_tokens = 0
        self.usage.save(update_fields=['overage_tokens'])

        with patch(METER_EVENT_PATH) as mock_create:
            report_overage_to_stripe()

        mock_create.assert_not_called()

    def test_report_overage_skips_no_customer_id(self):
        """
        org.stripe_customer_id=None → logger.error, no Stripe call, no exception raised.
        """
        self.org.stripe_customer_id = None
        self.org.save(update_fields=['stripe_customer_id'])

        with patch(METER_EVENT_PATH) as mock_create:
            with self.assertLogs('stripe_meta.tasks', level=logging.ERROR):
                report_overage_to_stripe()

        mock_create.assert_not_called()


class ReportOverageFailureTest(OverageReportTestBase):

    def test_report_overage_failure_does_not_credit(self):
        """
        MeterEvent.create raising an exception must not credit tokens nor set
        overage_reported_at (allows retry on next run with the SAME identifier)
        and must not propagate the exception.
        """
        with patch(METER_EVENT_PATH, side_effect=Exception('stripe down')):
            report_overage_to_stripe()   # must not raise

        self.usage.refresh_from_db()
        self.assertEqual(self.usage.overage_reported_tokens, 0)
        self.assertIsNone(self.usage.overage_reported_at)


class ReportOverageIdempotentConflictTest(OverageReportTestBase):

    def test_report_overage_idempotent_stripe_conflict(self):
        """
        MeterEvent.create raises InvalidRequestError with "already exists" (Stripe
        identifier deduplication) → the same delta was already received on a prior
        run whose local update failed → apply the same local credit, log at INFO,
        do not re-raise.
        """
        exc = stripe.InvalidRequestError(
            "An event already exists with identifier 6-2026-06-overage-0.",
            "identifier",
        )
        with patch(METER_EVENT_PATH, side_effect=exc):
            with self.assertLogs('stripe_meta.tasks', level=logging.INFO) as cm:
                report_overage_to_stripe()   # must not raise

        self.usage.refresh_from_db()
        self.assertEqual(
            self.usage.overage_reported_tokens, 2_000_000,
            "idempotent hit must apply the same credit as a success",
        )
        self.assertIsNotNone(self.usage.overage_reported_at, "idempotent hit must set overage_reported_at")
        info_msgs = [m for m in cm.output if 'idempotent hit' in m]
        self.assertTrue(info_msgs, "expected INFO log for idempotent hit, got none")
        error_msgs = [m for m in cm.output if 'ERROR' in m]
        self.assertFalse(error_msgs, f"unexpected ERROR log on idempotent hit: {error_msgs}")

    def test_report_overage_invalid_request_non_conflict_still_fails(self):
        """
        InvalidRequestError whose message does NOT contain "already exists" (e.g. bad
        payload) must NOT credit tokens and must log at ERROR/EXCEPTION level.
        """
        exc = stripe.InvalidRequestError(
            "Invalid value for payload.value: must be a positive integer.",
            "payload[value]",
        )
        with patch(METER_EVENT_PATH, side_effect=exc):
            with self.assertLogs('stripe_meta.tasks', level=logging.ERROR):
                report_overage_to_stripe()   # must not raise

        self.usage.refresh_from_db()
        self.assertEqual(self.usage.overage_reported_tokens, 0)
        self.assertIsNone(self.usage.overage_reported_at)
