"""
Unit tests for report_overage_to_stripe Celery task (commit 11).

Mock boundary: stripe_meta.tasks.stripe.billing.MeterEvent.create
Uses new Billing Meter Events API only (Stripe 2025-03-31.basil+).
"""
import logging
from datetime import timedelta
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.utils import timezone

from django.contrib.auth import get_user_model

from core.models import Organization
from stripe_meta.models import Plan, Subscription, UsageMonthly
from stripe_meta.tasks import report_overage_to_stripe

User = get_user_model()

METER_EVENT_PATH = 'stripe_meta.tasks.stripe.billing.MeterEvent.create'


class OverageReportTestBase(TestCase):
    """
    Team plan with overage pricing, org with stripe_customer_id, one real
    subscription, and a current-month UsageMonthly row.
    Plan.objects.all().delete() silences the post-save signal.
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

        self.ym = timezone.now().strftime('%Y-%m')
        self.usage = UsageMonthly.objects.create(
            organization=self.org,
            year_month=self.ym,
            tokens_used=1_500_000,
            overage_tokens=1_500_000,
        )


class ReportOverageMeterEventTest(OverageReportTestBase):

    def test_report_overage_meter_event(self):
        """
        overage_tokens=1_500_000 → units=1 (floor division by 1M).
        MeterEvent.create called once with correct args; overage_reported_at set.
        """
        with patch(METER_EVENT_PATH) as mock_create:
            report_overage_to_stripe()

        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args[1]

        self.assertEqual(call_kwargs['event_name'], 'token_overage')
        self.assertEqual(call_kwargs['payload']['value'], '1')
        self.assertEqual(call_kwargs['payload']['stripe_customer_id'], 'cus_overage_test')
        self.assertEqual(
            call_kwargs['identifier'],
            f'{self.org.id}-{self.ym}-overage',
        )
        self.assertIn('timestamp', call_kwargs)

        self.usage.refresh_from_db()
        self.assertIsNotNone(self.usage.overage_reported_at)

    def test_report_overage_uses_string_value(self):
        """value in MeterEvent.create payload must be str, not int."""
        with patch(METER_EVENT_PATH) as mock_create:
            report_overage_to_stripe()

        payload = mock_create.call_args[1]['payload']
        self.assertIsInstance(payload['value'], str)


class ReportOverageIdempotencyTest(OverageReportTestBase):

    def test_report_overage_idempotency(self):
        """
        Running the task twice in the same month must call MeterEvent.create
        exactly once — the local overage_reported_at guard blocks the second run.
        """
        with patch(METER_EVENT_PATH) as mock_create:
            report_overage_to_stripe()
            report_overage_to_stripe()

        mock_create.assert_called_once()


class ReportOverageSkipConditionsTest(OverageReportTestBase):

    def test_report_overage_skips_zero(self):
        """overage_tokens=0 → MeterEvent.create must not be called."""
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

    def test_report_overage_failure_does_not_set_reported_at(self):
        """
        MeterEvent.create raising an exception must not set overage_reported_at
        (allows retry on next run) and must not propagate the exception.
        """
        with patch(METER_EVENT_PATH, side_effect=Exception('stripe down')):
            report_overage_to_stripe()   # must not raise

        self.usage.refresh_from_db()
        self.assertIsNone(self.usage.overage_reported_at)
