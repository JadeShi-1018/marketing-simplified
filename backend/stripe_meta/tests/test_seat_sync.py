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


# ---------------------------------------------------------------------------
# invite — seat-cap enforcement (Team: block / allow; Free: upgrade prompt)
# ---------------------------------------------------------------------------

class SeatCapEnforcementTest(SeatSyncTestBase):
    """
    Invite endpoint must enforce seat_count purchased limit (Model B).
    SeatSyncTestBase provides a Team plan, 1 admin member, and a real
    (is_internal=False) subscription.
    """

    def test_invite_blocked_at_seat_limit(self):
        """
        Org at capacity (members == seat_count) → 403 SEAT_LIMIT_REACHED.
        Response must include seats_available=0, seats_purchased, upgrade_required=False.
        """
        self.subscription.seat_count = 2
        self.subscription.save()

        # Fill to capacity: admin (1) + 1 extra = 2 members = seat_count
        extra = User.objects.create_user(email='filler@test.com', username='filler', password='pw')
        extra.organization = self.org
        extra.save()

        invitee = User.objects.create_user(email='blocked@test.com', username='blocked', password='pw')

        response = self.client.post(
            INVITE_URL,
            {'emails': ['blocked@test.com']},
            format='json',
            HTTP_X_ORGANIZATION_TOKEN=self.org_token,
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        data = response.json()
        self.assertEqual(data['code'], 'SEAT_LIMIT_REACHED')
        self.assertEqual(data['seats_available'], 0)
        self.assertEqual(data['seats_purchased'], 2)
        self.assertFalse(data['upgrade_required'])
        # Invitee must NOT have been added to org
        invitee.refresh_from_db()
        self.assertIsNone(invitee.organization)

    def test_invite_allowed_within_seat_limit(self):
        """
        Org has available seats → 200 and member is added.
        """
        self.subscription.seat_count = 5
        self.subscription.save()

        # admin is 1 member; 4 seats available
        invitee = User.objects.create_user(email='welcome@test.com', username='welcome', password='pw')

        response = self.client.post(
            INVITE_URL,
            {'emails': ['welcome@test.com']},
            format='json',
            HTTP_X_ORGANIZATION_TOKEN=self.org_token,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        invitee.refresh_from_db()
        self.assertEqual(invitee.organization, self.org)


class FreeSeatCapTest(TestCase):
    """
    Free orgs use a sentinel subscription (is_internal=True, seat_count=1).
    Inviting a 2nd member must return 403 with upgrade_required=True,
    guiding the admin to upgrade to Team rather than buy extra seats.
    """

    def setUp(self):
        # Use get_or_create so migration-0004-seeded Free plan doesn't produce a duplicate
        # that makes Plan.objects.get(name="Free") raise MultipleObjectsReturned in the signal.
        self.free_plan, _ = Plan.objects.get_or_create(
            name='Free',
            defaults={
                'base_price_cents': 0,
                'included_seats': 1,
                'stripe_price_id': None,
                'stripe_extra_seat_price_id': None,
            },
        )
        # Guarantee included_seats=1 in case the seeded plan diverged.
        if self.free_plan.included_seats != 1:
            self.free_plan.included_seats = 1
            self.free_plan.save(update_fields=['included_seats'])

        self.org = Organization.objects.create(name='Free Org', slug='free-org-seatcap')
        # Signal has fired: sentinel subscription created with seat_count=1 (model default).
        # Guard: if signal silently failed (e.g. plan lookup race), create sentinel manually.
        self.sentinel, _ = Subscription.objects.get_or_create(
            organization=self.org,
            is_internal=True,
            defaults={
                'plan': self.free_plan,
                'stripe_subscription_id': f'sub_free_internal_{self.org.id}',
                'start_date': timezone.now(),
                'end_date': timezone.now() + timedelta(days=365 * 100),
                'is_active': True,
                'seat_count': 1,
            },
        )
        # Ensure active and at correct seat_count regardless of pre-existing state.
        if not self.sentinel.is_active or self.sentinel.seat_count != 1:
            self.sentinel.is_active = True
            self.sentinel.seat_count = 1
            self.sentinel.save(update_fields=['is_active', 'seat_count'])

        self.admin = User.objects.create_user(
            email='free_admin@test.com', username='free_admin', password='pw',
        )
        self.admin.organization = self.org
        self.admin.save()

        admin_role = Role.objects.create(organization=self.org, name='Organization Admin', level=2)
        UserRole.objects.create(user=self.admin, role=admin_role)

        self.org_token = generate_organization_access_token(self.admin)
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_free_org_invite_second_member_blocked(self):
        """
        Free org has 1 seat (sentinel seat_count=1). Admin already occupies it.
        Inviting a 2nd member must return 403 SEAT_LIMIT_REACHED with
        upgrade_required=True, pointing toward a plan upgrade (not seat purchase).
        """
        invitee = User.objects.create_user(
            email='second@test.com', username='second', password='pw',
        )

        response = self.client.post(
            INVITE_URL,
            {'emails': ['second@test.com']},
            format='json',
            HTTP_X_ORGANIZATION_TOKEN=self.org_token,
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        data = response.json()
        self.assertEqual(data['code'], 'SEAT_LIMIT_REACHED')
        self.assertEqual(data['seats_available'], 0)
        self.assertEqual(data['seats_purchased'], 1)
        self.assertTrue(data['upgrade_required'])
        self.assertIn('Upgrade to Team', data['error'])
        # Invitee must NOT have been added
        invitee.refresh_from_db()
        self.assertIsNone(invitee.organization)
