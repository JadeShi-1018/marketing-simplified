"""
Unit tests for stripe_meta/views.py::stripe_webhook.

Covers:
  - Bad signature → 400
  - Idempotency: same event_id twice → handler fires once, second returns duplicate
  - Handler exception → 500, error_message saved, processed_at NOT set (enables Stripe retry)
"""
import json
import logging
from unittest.mock import patch, Mock

import stripe
from django.contrib.auth import get_user_model
from django.test import TestCase, Client

from stripe_meta.models import Plan, Subscription, StripeWebhookEvent, Payment
from stripe_meta.views import handle_payment_succeeded, handle_subscription_created
from core.models import Organization

User = get_user_model()


def _make_event(event_id, event_type='checkout.session.completed', obj=None):
    """Return a minimal dict that looks like a Stripe Event."""
    return {
        'id': event_id,
        'type': event_type,
        'data': {'object': obj or {'id': 'cs_test_obj'}},
    }


class WebhookTests(TestCase):
    """
    Webhook view is @csrf_exempt; Django's test Client skips CSRF enforcement.
    Plans deleted first so the org auto-subscribe signal is a no-op.
    """

    def setUp(self):
        Plan.objects.all().delete()
        self.org = Organization.objects.create(name='WebhookOrg')
        self.client = Client(enforce_csrf_checks=False)

    def _post(self, body_dict=None, sig='valid_sig'):
        body = json.dumps(body_dict or {}).encode()
        return self.client.post(
            '/api/stripe/webhook/',
            data=body,
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE=sig,
        )

    # ── Signature verification ─────────────────────────────────────────────

    def test_webhook_signature_invalid(self):
        """
        stripe.Webhook.construct_event raises SignatureVerificationError
        → view returns 400 and creates no StripeWebhookEvent row.
        """
        with patch('stripe_meta.views.stripe.Webhook.construct_event') as mock_ce:
            mock_ce.side_effect = stripe.SignatureVerificationError(
                'Invalid signature', 'bad_sig'
            )
            response = self._post()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(StripeWebhookEvent.objects.count(), 0)

    # ── Idempotency ────────────────────────────────────────────────────────

    def test_webhook_idempotency(self):
        """
        Same event_id sent twice:
          1st call → handler fires, processed_at set.
          2nd call → duplicate branch, handler NOT called again.
        Only one StripeWebhookEvent row created.
        """
        event = _make_event('evt_idem_001')

        with patch('stripe_meta.views.stripe.Webhook.construct_event', return_value=event):
            with patch('stripe_meta.views.handle_checkout_completed') as mock_handler:
                # First call — should process
                r1 = self._post()
                self.assertEqual(r1.status_code, 200)
                mock_handler.assert_called_once()

                # Second call — should return duplicate
                r2 = self._post()
                self.assertEqual(r2.status_code, 200)
                self.assertEqual(json.loads(r2.content).get('status'), 'duplicate')
                # Handler still only called once total
                mock_handler.assert_called_once()

        self.assertEqual(
            StripeWebhookEvent.objects.filter(stripe_event_id='evt_idem_001').count(), 1
        )
        # Ensure processed_at was set after first successful call
        evt = StripeWebhookEvent.objects.get(stripe_event_id='evt_idem_001')
        self.assertIsNotNone(evt.processed_at)

    # ── Error bubbling ─────────────────────────────────────────────────────

    def test_webhook_error_bubbling(self):
        """
        Handler raises an exception:
          - View must return 500 (not silently 200).
          - StripeWebhookEvent.error_message must be non-empty.
          - StripeWebhookEvent.processed_at must remain None so Stripe retries.
        """
        event = _make_event('evt_err_001')

        with patch('stripe_meta.views.stripe.Webhook.construct_event', return_value=event):
            with patch('stripe_meta.views.handle_checkout_completed') as mock_handler:
                mock_handler.side_effect = RuntimeError('handler boom')
                response = self._post()

        self.assertEqual(response.status_code, 500)

        evt = StripeWebhookEvent.objects.get(stripe_event_id='evt_err_001')
        # error_message is TextField(blank=True) — default is '', not None.
        # Use assertTrue / assertNotEqual, never assertIsNotNone.
        self.assertTrue(evt.error_message, msg='error_message must be non-empty')
        # processed_at must NOT be set: if it were set, Stripe would not retry.
        self.assertIsNone(evt.processed_at)

    # ── Handler dispatch ───────────────────────────────────────────────────

    def test_unknown_event_type_is_ignored(self):
        """
        Event type not in handlers dict → processed_at IS set (acknowledged),
        response status 'ignored', no handler error.
        """
        event = _make_event('evt_unknown_001', event_type='some.unknown.event')

        with patch('stripe_meta.views.stripe.Webhook.construct_event', return_value=event):
            response = self._post()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content).get('status'), 'ignored')
        evt = StripeWebhookEvent.objects.get(stripe_event_id='evt_unknown_001')
        self.assertIsNotNone(evt.processed_at)


# ---------------------------------------------------------------------------
# Handler-level regression tests — call handler functions directly
# ---------------------------------------------------------------------------

class WebhookHandlerRegressionTests(TestCase):
    """
    Regression tests for real-payload bugs found during live webhook testing.
    Call handler functions directly so the failure mode is isolated from the
    dispatch machinery.
    Plans deleted first so the org signal is a no-op.
    """

    def setUp(self):
        Plan.objects.all().delete()
        self.org = Organization.objects.create(name='RegressionOrg', slug='regression-org')

    def test_payment_succeeded_null_parent(self):
        """
        Stripe sends parent=null on one-off invoices (no subscription).
        handle_payment_succeeded must not raise AttributeError and must skip
        Payment creation when there is no subscription_id.

        Regression: `parent.get(...)` on None was AttributeError → 500.
        Fix: `parent = invoice_data.get('parent') or {}`
        """
        invoice = {
            'id': 'in_null_parent_regression',
            'customer': 'cus_regression_abc',
            'parent': None,
            'lines': {'data': []},
        }
        mock_customer = Mock()
        mock_customer.metadata = {'user_id': '99999', 'organization_id': str(self.org.id)}

        before = Payment.objects.count()
        with patch('stripe_meta.views.stripe.Customer.retrieve', return_value=mock_customer):
            handle_payment_succeeded(invoice)   # must not raise

        self.assertEqual(Payment.objects.count(), before)

    def test_subscription_created_missing_org_id(self):
        """
        customer.subscription.created where customer metadata has no organization_id
        (stripe trigger / manually-created customers) must:
          - not raise ValueError
          - log a warning
          - not create any Subscription row
          - return normally so the webhook view returns 200 (stops Stripe retrying)

        Regression: previously raised ValueError → 500 → Stripe retried indefinitely.
        Fix: logger.warning + return (no raise).
        """
        payload = {
            'id': 'sub_no_org_regression',
            'status': 'active',
            'customer': 'cus_no_org_regression',
            'start_date': 1700000000,
            'items': {'data': []},
        }
        mock_customer = Mock()
        mock_customer.metadata = {}   # no organization_id

        before = Subscription.objects.count()
        with patch('stripe_meta.views.stripe.Customer.retrieve', return_value=mock_customer):
            with self.assertLogs('stripe_meta.views', level=logging.WARNING):
                handle_subscription_created(payload)   # must not raise

        self.assertEqual(Subscription.objects.count(), before)


class SubscriptionCreatedTests(TestCase):
    """
    handle_subscription_created: sentinel deactivation (Bug 1 Layer A)
    and seat_count initialisation (Bug 2).
    Plans deleted first so org-creation signal is a no-op.
    """

    def setUp(self):
        Plan.objects.all().delete()
        self.org = Organization.objects.create(name='SubCreatedOrg', slug='sub-created-org')
        self.team_plan = Plan.objects.create(
            name='Team',
            stripe_price_id='price_team_test',
            monthly_token_quota=5_000_000,
            base_price_cents=4900,
            included_seats=5,
        )
        self.mock_customer = Mock()
        self.mock_customer.metadata = {'organization_id': str(self.org.id)}

    def _make_payload(self, status='active'):
        return {
            'id': 'sub_created_test_001',
            'status': status,
            'customer': 'cus_test_001',
            'start_date': 1700000000,
            'items': {
                'data': [{
                    'price': {'id': 'price_team_test'},
                    'current_period_end': 1702678400,
                }]
            },
        }

    def test_subscription_created_deactivates_free_sentinel(self):
        """
        When a real subscription (is_internal=False) is created for an org that
        already has an active Free sentinel (is_internal=True), the sentinel must
        be deactivated.

        Regression: sentinel was left active, causing get_active_real_subscription
        to return Free plan for paid orgs (Bug 1).
        """
        sentinel = Subscription.objects.create(
            organization=self.org,
            plan=self.team_plan,  # plan doesn't matter for this assertion
            stripe_subscription_id='sub_sentinel_free_001',
            start_date='2024-01-01',
            end_date='2099-01-01',
            is_active=True,
            is_internal=True,
        )

        with patch('stripe_meta.views.stripe.Customer.retrieve', return_value=self.mock_customer):
            handle_subscription_created(self._make_payload())

        sentinel.refresh_from_db()
        self.assertFalse(sentinel.is_active, "Free sentinel must be deactivated after real sub is created")

