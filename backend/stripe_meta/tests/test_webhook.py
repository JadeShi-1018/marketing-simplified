"""
Unit tests for stripe_meta/views.py::stripe_webhook.

Covers:
  - Bad signature → 400
  - Idempotency: same event_id twice → handler fires once, second returns duplicate
  - Handler exception → 500, error_message saved, processed_at NOT set (enables Stripe retry)
"""
import json
from unittest.mock import patch, MagicMock

import stripe
from django.test import TestCase, Client

from stripe_meta.models import Plan, Subscription, StripeWebhookEvent
from core.models import Organization


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
