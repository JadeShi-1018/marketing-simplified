"""
Unit tests for commit-10: switch_plan sentinel handling, price_id item
matching, and sync_seat_count seat auto-sync.

Mock boundary: stripe_meta.views.stripe for endpoint tests,
stripe_meta.services.stripe for direct sync_seat_count calls.
"""
import stripe
from datetime import timedelta
from unittest.mock import patch, Mock, call

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
from stripe_meta.services import sync_seat_count

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
# sync_seat_count — direct function tests
# ---------------------------------------------------------------------------

class SyncSeatCountTest(SeatSyncTestBase):

    def _stripe_sub_with_seat_item(self, item_id='si_seat'):
        """Mock Stripe subscription response containing an extra-seat item."""
        return {
            'id': 'sub_team_real',
            'items': {
                'data': [
                    {'id': 'si_base',  'price': {'id': 'price_team_base'}},
                    {'id': item_id,    'price': {'id': 'price_team_seat'}},
                    {'id': 'si_over',  'price': {'id': 'price_team_overage'}},
                ]
            },
        }

    def test_sync_seat_count_increase(self):
        """
        Org currently has 8 users, plan.included_seats=5 → extra_seats=3.
        stripe.Subscription.modify must receive quantity=3 with
        proration_behavior='create_prorations'.
        """
        # Create 7 additional users (setUp already created self.user = 1)
        for i in range(7):
            u = User.objects.create_user(
                email=f'member{i}@test.com',
                username=f'member{i}',
                password='pw',
            )
            u.organization = self.org
            u.save()

        self.assertEqual(
            User.objects.filter(organization=self.org).count(), 8,
        )

        with patch('stripe_meta.services.stripe') as mock_stripe:
            mock_stripe.Subscription.retrieve.return_value = self._stripe_sub_with_seat_item()
            mock_stripe.Subscription.modify.return_value = {}

            sync_seat_count(self.org)

        mock_stripe.Subscription.modify.assert_called_once_with(
            'sub_team_real',
            items=[{'id': 'si_seat', 'quantity': 3}],
            proration_behavior='create_prorations',
        )

    def test_sync_seat_count_free_no_stripe_call(self):
        """
        Org with only a Free sentinel subscription (is_internal=True) must
        exit sync_seat_count without calling stripe.Subscription.retrieve.
        """
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

        with patch('stripe_meta.services.stripe') as mock_stripe:
            sync_seat_count(self.org)

        mock_stripe.Subscription.retrieve.assert_not_called()
        mock_stripe.Subscription.modify.assert_not_called()

    def _stripe_sub_without_seat_item(self):
        """Mock Stripe subscription response with NO extra-seat item (5-seat-start)."""
        return {
            'id': 'sub_team_real',
            'items': {
                'data': [
                    {'id': 'si_base', 'price': {'id': 'price_team_base'}},
                    {'id': 'si_over', 'price': {'id': 'price_team_overage'}},
                ]
            },
        }

    def test_sync_seat_add_when_no_extra_item(self):
        """
        Stripe sub has no extra-seat item (5-seat-start checkout) and org now
        has 6 members → extra_seats=1. sync_seat_count must ADD the item via
        {'price': stripe_extra_seat_price_id, 'quantity': 1}, NOT return early.

        Regression: extra_item=None branch previously logged a warning and
        returned without calling modify — 6th seat was never billed.
        """
        for i in range(5):
            u = User.objects.create_user(
                email=f'add_member{i}@test.com', username=f'addmember{i}', password='pw',
            )
            u.organization = self.org
            u.save()
        # setUp created self.user → 1 + 5 = 6 members total

        with patch('stripe_meta.services.stripe') as mock_stripe:
            mock_stripe.Subscription.retrieve.return_value = self._stripe_sub_without_seat_item()
            mock_stripe.Subscription.modify.return_value = {}

            sync_seat_count(self.org)

        mock_stripe.Subscription.modify.assert_called_once_with(
            'sub_team_real',
            items=[{'price': 'price_team_seat', 'quantity': 1}],
            proration_behavior='create_prorations',
        )
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.seat_count, 6)

    def test_sync_seat_update_existing_item(self):
        """
        Stripe sub already has an extra-seat item. sync_seat_count must UPDATE
        its quantity via {'id': item_id, 'quantity': N} — not add a new one.
        """
        for i in range(7):
            u = User.objects.create_user(
                email=f'upd_member{i}@test.com', username=f'updmember{i}', password='pw',
            )
            u.organization = self.org
            u.save()
        # 1 + 7 = 8 members → extra_seats = 8 - 5 = 3

        with patch('stripe_meta.services.stripe') as mock_stripe:
            mock_stripe.Subscription.retrieve.return_value = self._stripe_sub_with_seat_item('si_seat_existing')
            mock_stripe.Subscription.modify.return_value = {}

            sync_seat_count(self.org)

        mock_stripe.Subscription.modify.assert_called_once_with(
            'sub_team_real',
            items=[{'id': 'si_seat_existing', 'quantity': 3}],
            proration_behavior='create_prorations',
        )
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.seat_count, 8)

    def test_sync_seat_zero_extra_no_stripe_call(self):
        """
        Org has 1 member (≤ included_seats=5) and no extra-seat item on the sub.
        extra_seats=0 → must NOT call stripe.Subscription.modify; must update
        local seat_count only.
        """
        # setUp created self.user only → member count = 1, extra_seats = 0
        with patch('stripe_meta.services.stripe') as mock_stripe:
            mock_stripe.Subscription.retrieve.return_value = self._stripe_sub_without_seat_item()

            sync_seat_count(self.org)

        mock_stripe.Subscription.modify.assert_not_called()
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.seat_count, 1)


# ---------------------------------------------------------------------------
# invite — triggers sync_seat_count
# ---------------------------------------------------------------------------

class InviteTriggersSyncTest(SeatSyncTestBase):

    def test_invite_triggers_sync_seat_count(self):
        """
        A successful invite call must invoke sync_seat_count exactly once
        with the inviting user's organization.
        """
        invitee = User.objects.create_user(
            email='invitee@test.com', username='invitee', password='pw',
        )

        with patch('stripe_meta.views.sync_seat_count') as mock_sync:
            response = self.client.post(
                INVITE_URL,
                {'emails': ['invitee@test.com']},
                format='json',
                HTTP_X_ORGANIZATION_TOKEN=self.org_token,
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_sync.assert_called_once_with(self.org)
