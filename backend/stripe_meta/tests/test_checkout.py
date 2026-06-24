"""
Unit tests for commit-9 three-tier checkout logic.

Covers:
  - Three-tier line_items (base + extra seats + metered overage)
  - Customer caching: existing stripe_customer_id skips Customer.create
  - Free sentinel (is_internal=True) does not block new checkout
"""
import stripe
from datetime import timedelta
from unittest.mock import patch, Mock

from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Organization
from stripe_meta.models import Plan, Subscription
from stripe_meta.permissions import generate_organization_access_token

User = get_user_model()

CHECKOUT_URL = '/api/stripe/checkout/'


class CheckoutTestBase(TestCase):
    """
    Team plan with seat + overage price IDs, org with no real subscription.
    Plan.objects.all().delete() silences the signal (no Free plan to find).
    """

    def setUp(self):
        Plan.objects.all().delete()

        self.org = Organization.objects.create(name='Checkout Org', slug='checkout-org')
        self.user = User.objects.create_user(
            email='checkout@test.com',
            username='checkoutuser',
            password='testpass',
        )
        self.user.organization = self.org
        self.user.save()

        self.plan = Plan.objects.create(
            name='Team',
            stripe_price_id='price_team_base',
            stripe_extra_seat_price_id='price_team_seat',
            stripe_overage_price_id='price_team_overage',
            included_seats=3,
            base_price_cents=4900,
            monthly_token_quota=5_000_000,
        )

        self.org_token = generate_organization_access_token(self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _post(self, seat_count=1, extra=None):
        payload = {
            'plan_id': self.plan.id,
            'success_url': 'https://example.com/success',
            'cancel_url': 'https://example.com/cancel',
            'seat_count': seat_count,
        }
        if extra:
            payload.update(extra)
        return self.client.post(
            CHECKOUT_URL,
            payload,
            format='json',
            HTTP_X_ORGANIZATION_TOKEN=self.org_token,
        )

    def _mock_session(self, url='https://checkout.stripe.com/test'):
        s = Mock()
        s.id = 'cs_test_abc'
        s.url = url
        return s

    def _mock_customer(self, customer_id='cus_test_new'):
        c = Mock()
        c.id = customer_id
        return c


class CheckoutThreeTierLineItemsTest(CheckoutTestBase):

    def test_checkout_three_line_items_with_overage(self):
        """
        seat_count=5, included_seats=3 → extra_seats=2.
        Session.create must receive exactly three line_items:
          [0] base plan (stripe_price_id, qty=1)
          [1] extra seats (stripe_extra_seat_price_id, qty=2)
          [2] metered overage (stripe_overage_price_id, no quantity key)
        """
        with patch('stripe_meta.views.stripe') as mock_stripe:
            mock_stripe.StripeError = stripe.StripeError
            mock_stripe.Customer.create.return_value = self._mock_customer()
            mock_stripe.checkout.Session.create.return_value = self._mock_session()

            response = self._post(seat_count=5)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        call_kwargs = mock_stripe.checkout.Session.create.call_args[1]
        line_items = call_kwargs['line_items']

        self.assertEqual(len(line_items), 3)

        # [0] base
        self.assertEqual(line_items[0]['price'], 'price_team_base')
        self.assertEqual(line_items[0]['quantity'], 1)

        # [1] extra seats: 5 requested − 3 included = 2
        self.assertEqual(line_items[1]['price'], 'price_team_seat')
        self.assertEqual(line_items[1]['quantity'], 2)

        # [2] metered overage: no quantity field (Stripe metered billing)
        self.assertEqual(line_items[2]['price'], 'price_team_overage')
        self.assertNotIn('quantity', line_items[2])

    def test_checkout_no_extra_seat_item_when_within_included(self):
        """
        seat_count ≤ included_seats → only two line_items (base + overage, no seat item).
        """
        with patch('stripe_meta.views.stripe') as mock_stripe:
            mock_stripe.StripeError = stripe.StripeError
            mock_stripe.Customer.create.return_value = self._mock_customer()
            mock_stripe.checkout.Session.create.return_value = self._mock_session()

            response = self._post(seat_count=2)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        line_items = mock_stripe.checkout.Session.create.call_args[1]['line_items']

        self.assertEqual(len(line_items), 2)
        self.assertEqual(line_items[0]['price'], 'price_team_base')
        self.assertEqual(line_items[1]['price'], 'price_team_overage')
        self.assertNotIn('quantity', line_items[1])


class CheckoutCustomerCacheTest(CheckoutTestBase):

    def test_checkout_customer_cache_reuses_existing_id(self):
        """
        org already has stripe_customer_id → Customer.create must NOT be called,
        and Session.create must receive the cached customer id.
        """
        self.org.stripe_customer_id = 'cus_existing_abc'
        self.org.save(update_fields=['stripe_customer_id'])

        with patch('stripe_meta.views.stripe') as mock_stripe:
            mock_stripe.StripeError = stripe.StripeError
            mock_stripe.checkout.Session.create.return_value = self._mock_session()

            response = self._post()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_stripe.Customer.create.assert_not_called()

        session_kwargs = mock_stripe.checkout.Session.create.call_args[1]
        self.assertEqual(session_kwargs['customer'], 'cus_existing_abc')

    def test_checkout_creates_customer_and_caches_id_when_none(self):
        """
        org has no stripe_customer_id → Customer.create is called once,
        result is persisted to org.stripe_customer_id.
        """
        self.assertFalse(self.org.stripe_customer_id)

        with patch('stripe_meta.views.stripe') as mock_stripe:
            mock_stripe.StripeError = stripe.StripeError
            mock_stripe.Customer.create.return_value = self._mock_customer('cus_brand_new')
            mock_stripe.checkout.Session.create.return_value = self._mock_session()

            response = self._post()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_stripe.Customer.create.assert_called_once()

        self.org.refresh_from_db()
        self.assertEqual(self.org.stripe_customer_id, 'cus_brand_new')

        session_kwargs = mock_stripe.checkout.Session.create.call_args[1]
        self.assertEqual(session_kwargs['customer'], 'cus_brand_new')


class CheckoutSentinelNotBlockingTest(CheckoutTestBase):

    def test_checkout_free_sentinel_not_blocking(self):
        """
        Org has only an is_internal=True Free sentinel subscription.
        Checkout must NOT return SUBSCRIPTION_EXISTS — the sentinel is exempt
        from the uniqueness guard (is_internal=False filter in the view).
        Regression: depends on signals.py fix that sets is_internal=True.
        """
        Subscription.objects.create(
            organization=self.org,
            plan=self.plan,
            stripe_subscription_id=f'sub_free_sentinel_{self.org.id}',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=365 * 100),
            is_active=True,
            is_internal=True,
        )

        with patch('stripe_meta.views.stripe') as mock_stripe:
            mock_stripe.StripeError = stripe.StripeError
            mock_stripe.Customer.create.return_value = self._mock_customer()
            mock_stripe.checkout.Session.create.return_value = self._mock_session()

            response = self._post()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('checkout_url', response.data)

    def test_checkout_real_sub_blocks(self):
        """
        Counterpart: a real active (is_internal=False) subscription does block.
        Ensures the sentinel exemption is specific, not a blanket bypass.
        """
        Subscription.objects.create(
            organization=self.org,
            plan=self.plan,
            stripe_subscription_id='sub_real_active',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30),
            is_active=True,
            is_internal=False,
        )

        response = self._post()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['code'], 'SUBSCRIPTION_EXISTS')
