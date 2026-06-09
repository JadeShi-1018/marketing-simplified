"""
Seat model (Model B): switch_plan sentinel handling, price_id item matching,
handle_subscription_created seat derivation, and leave/remove no-seat-change.

Mock boundary: stripe_meta.views.stripe for endpoint tests.
"""
import stripe
from datetime import timedelta
from unittest.mock import patch, Mock

from django.test import TestCase
from django.utils import timezone
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from core.models import Organization, Role
from access_control.models import UserRole
from stripe_meta.models import Plan, Subscription
from stripe_meta.permissions import generate_organization_access_token
from stripe_meta.views import handle_subscription_created

User = get_user_model()

SWITCH_PLAN_URL = reverse('stripe_meta:switch_plan')
INVITE_URL = reverse('stripe_meta:invite_users_to_organization')


class SeatSyncTestBase(TestCase):
    """
    Team plan with seat + overage pricing, one real active subscription,
    admin user. Plan.objects.all().delete() silences the signal.
    """

    def setUp(self):
        Plan.objects.all().delete()

        self.org = Organization.objects.create(name='Seat Sync Org', slug='seat-sync-org')
        self.user = User.objects.create_user(
            email='admin@test.com', username='adminuser', password='testpass',
        )
        self.user.organization = self.org
        self.user.save()

        # Admin role required for invite / remove endpoints
        admin_role = Role.objects.create(
            organization=self.org, name='Organization Admin', level=2,
        )
        UserRole.objects.create(user=self.user, role=admin_role)

        self.plan = Plan.objects.create(
            name='Team',
            stripe_price_id='price_team_base',
            stripe_extra_seat_price_id='price_team_seat',
            stripe_overage_price_id='price_team_overage',
            included_seats=5,
            base_price_cents=4900,
        )
        self.target_plan = Plan.objects.create(
            name='Team Pro',
            stripe_price_id='price_team_pro',
            stripe_extra_seat_price_id='price_pro_seat',
            stripe_overage_price_id='price_pro_overage',
            included_seats=10,
            base_price_cents=9900,
        )
        self.subscription = Subscription.objects.create(
            organization=self.org,
            plan=self.plan,
            stripe_subscription_id='sub_team_real',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=365),
            is_active=True,
            is_internal=False,
        )

        self.org_token = generate_organization_access_token(self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _switch_post(self, plan_id):
        return self.client.post(
            SWITCH_PLAN_URL,
            {'plan_id': plan_id},
            format='json',
            HTTP_X_ORGANIZATION_TOKEN=self.org_token,
        )

    def _mock_price(self, cents):
        p = Mock()
        p.unit_amount = cents
        return p


# ---------------------------------------------------------------------------
# switch_plan — sentinel redirect
# ---------------------------------------------------------------------------

class SwitchPlanSentinelTest(SeatSyncTestBase):

    def test_switch_plan_from_free_sentinel(self):
        """
        Org with only an is_internal=True sentinel → switch_plan must return
        redirect_to='checkout' (200) and must NOT call stripe.Subscription.modify.
        """
        # Replace real sub with sentinel only
        self.subscription.delete()
        Subscription.objects.create(
            organization=self.org,
            plan=self.plan,
            stripe_subscription_id=f'sub_sentinel_{self.org.id}',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=365 * 100),
            is_active=True,
            is_internal=True,
        )

        with patch('stripe_meta.views.stripe') as mock_stripe:
            mock_stripe.StripeError = stripe.StripeError

            response = self._switch_post(self.target_plan.id)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['redirect_to'], 'checkout')
        mock_stripe.Subscription.modify.assert_not_called()


# ---------------------------------------------------------------------------
# switch_plan — price_id item matching
# ---------------------------------------------------------------------------

class SwitchPlanItemMatchTest(SeatSyncTestBase):

    def test_switch_plan_matches_item_by_price_id(self):
        """
        Multi-item Stripe subscription: overage item first, base-plan item second.
        switch_plan must locate the base item by price['id'] and pass its id to
        Subscription.modify — NOT the first item's id (data[0] would be wrong).
        """
        # Two items: overage at index 0, base at index 1
        mock_stripe_sub = {
            'id': 'sub_team_real',
            'items': {
                'data': [
                    {'id': 'si_overage', 'price': {'id': 'price_team_overage'}},
                    {'id': 'si_base',    'price': {'id': 'price_team_base'}},
                ]
            },
        }

        with patch('stripe_meta.views.stripe') as mock_stripe:
            mock_stripe.StripeError = stripe.StripeError
            mock_stripe.Subscription.retrieve.return_value = mock_stripe_sub
            mock_stripe.Subscription.modify.return_value = {}
            mock_stripe.Price.retrieve.side_effect = [
                self._mock_price(4900),   # current plan price
                self._mock_price(9900),   # target plan price (upgrade)
            ]

            response = self._switch_post(self.target_plan.id)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # modify must have been called with 'si_base', not 'si_overage'
        modify_call = mock_stripe.Subscription.modify.call_args
        items_arg = modify_call[1]['items']
        self.assertEqual(len(items_arg), 1)
        self.assertEqual(items_arg[0]['id'], 'si_base')
        self.assertNotEqual(items_arg[0]['id'], 'si_overage')


# ---------------------------------------------------------------------------
# leave / remove — seat_count must NOT change (Model B: seat ≠ member count)
# ---------------------------------------------------------------------------

class MemberRemovalSeatStabilityTest(SeatSyncTestBase):

    def test_leave_org_does_not_change_seat_count(self):
        """
        leave_organization must not modify seat_count.
        Under Model B, purchased seats are independent of member count.
        """
        self.subscription.seat_count = 8
        self.subscription.save()

        response = self.client.post(
            reverse('stripe_meta:leave_organization'),
            HTTP_X_ORGANIZATION_TOKEN=self.org_token,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.seat_count, 8)

    def test_remove_user_does_not_change_seat_count(self):
        """
        remove_organization_user must not modify seat_count.
        Under Model B, purchased seats are independent of member count.
        """
        self.subscription.seat_count = 8
        self.subscription.save()

        member = User.objects.create_user(
            email='removable@test.com', username='removable', password='pw',
        )
        member.organization = self.org
        member.save()

        response = self.client.delete(
            reverse('stripe_meta:remove_organization_user', args=[member.id]),
            HTTP_X_ORGANIZATION_TOKEN=self.org_token,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.seat_count, 8)


# ---------------------------------------------------------------------------
# handle_subscription_created — seat_count derived from Stripe items (Model B)
# ---------------------------------------------------------------------------

class HandleSubscriptionCreatedSeatTest(TestCase):
    """
    Verify that handle_subscription_created derives seat_count from the
    extra-seat line item quantity rather than hardcoding plan.included_seats.
    """

    def setUp(self):
        Plan.objects.all().delete()
        self.org = Organization.objects.create(name='HSC Seat Org', slug='hsc-seat-org')
        self.plan = Plan.objects.create(
            name='Team',
            stripe_price_id='price_team_base',
            stripe_extra_seat_price_id='price_team_seat',
            stripe_overage_price_id='price_team_overage',
            included_seats=5,
            base_price_cents=4900,
        )
        self.mock_customer = Mock()
        self.mock_customer.metadata = {'organization_id': str(self.org.id)}

    def _make_event(self, extra_seat_qty=None):
        """Build a minimal subscription.created payload. Pass extra_seat_qty to include the seat item."""
        items_data = [
            {
                'id': 'si_base',
                'current_period_end': int((timezone.now() + timedelta(days=30)).timestamp()),
                'price': {'id': 'price_team_base'},
            },
        ]
        if extra_seat_qty is not None:
            items_data.append({
                'id': 'si_seat',
                'quantity': extra_seat_qty,
                'price': {'id': 'price_team_seat'},
            })
        return {
            'id': 'sub_hsc_1',
            'status': 'active',
            'customer': 'cus_hsc',
            'start_date': int((timezone.now() - timedelta(days=1)).timestamp()),
            'items': {'data': items_data},
        }

    def test_handle_subscription_created_reads_seats_from_items(self):
        """
        Checkout with 8 seats (3 extra beyond included_seats=5): extra-seat item qty=3.
        handle_subscription_created must write seat_count=8, not 5.
        """
        event_obj = self._make_event(extra_seat_qty=3)
        with patch('stripe_meta.views.stripe.Customer.retrieve', return_value=self.mock_customer):
            handle_subscription_created(event_obj)

        sub = Subscription.objects.get(stripe_subscription_id='sub_hsc_1')
        self.assertEqual(sub.seat_count, 8)

    def test_handle_subscription_created_no_extra_item(self):
        """
        Checkout at base price only (no extra-seat item) means the user bought
        exactly included_seats=5. seat_count must be 5.
        """
        event_obj = self._make_event(extra_seat_qty=None)
        with patch('stripe_meta.views.stripe.Customer.retrieve', return_value=self.mock_customer):
            handle_subscription_created(event_obj)

        sub = Subscription.objects.get(stripe_subscription_id='sub_hsc_1')
        self.assertEqual(sub.seat_count, 5)
