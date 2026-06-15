from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.urls import reverse
from rest_framework.test import APIClient

from core.models import Organization, Role
from access_control.models import UserRole
from stripe_meta.models import Plan, Subscription, UsageMonthly
from stripe_meta.permissions import generate_organization_access_token
from django.contrib.auth import get_user_model

User = get_user_model()


class OrgTokenSummaryTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        Plan.objects.all().delete()

        self.org = Organization.objects.create(name="Token Org", slug="token-org")
        self.user = User.objects.create_user(
            username="tokenuser", email="token@example.com",
            password="pass123", organization=self.org,
        )
        role = Role.objects.create(organization=self.org, name="Member", level=1)
        UserRole.objects.create(user=self.user, role=role)
        self.org_token = generate_organization_access_token(self.user)
        self.client.force_authenticate(user=self.user)

        self.plan = Plan.objects.create(
            name="Pro Plan",
            monthly_token_quota=1_000_000,
            overage_price_cents_per_1m=50,
            currency="AUD",
        )
        self.sub = Subscription.objects.create(
            organization=self.org,
            plan=self.plan,
            stripe_subscription_id="sub_test_123",
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30),
            is_active=True,
            is_internal=False,
        )
        self.ym = timezone.now().strftime('%Y-%m')

    def _url(self):
        return reverse('stripe_meta:org_token_summary')

    def test_correct_aggregation(self):
        UsageMonthly.objects.create(
            organization=self.org,
            year_month=self.ym,
            tokens_used=250_000,
            overage_tokens=50_000,
        )
        response = self.client.get(self._url(), HTTP_X_ORGANIZATION_TOKEN=self.org_token)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['tokens_used'], 250_000)
        self.assertEqual(data['overage_tokens'], 50_000)
        self.assertEqual(data['monthly_token_quota'], 1_000_000)
        self.assertEqual(data['overage_price_cents_per_1m'], 50)
        self.assertEqual(data['currency'], 'AUD')

    def test_org_scoping(self):
        other_org = Organization.objects.create(name="Other Org", slug="other-org")
        other_plan = Plan.objects.create(name="Other Plan", monthly_token_quota=500_000)
        Subscription.objects.create(
            organization=other_org, plan=other_plan,
            stripe_subscription_id="sub_other_456",
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30),
            is_active=True,
        )
        UsageMonthly.objects.create(
            organization=other_org, year_month=self.ym,
            tokens_used=999_999, overage_tokens=0,
        )
        UsageMonthly.objects.create(
            organization=self.org, year_month=self.ym,
            tokens_used=100, overage_tokens=0,
        )
        response = self.client.get(self._url(), HTTP_X_ORGANIZATION_TOKEN=self.org_token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['tokens_used'], 100)

    def test_free_sentinel_plan(self):
        self.sub.delete()
        free_plan = Plan.objects.create(
            name="Free", monthly_token_quota=10_000,
            overage_price_cents_per_1m=0,
        )
        Subscription.objects.create(
            organization=self.org, plan=free_plan,
            stripe_subscription_id="",
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30),
            is_active=True, is_internal=True,
        )
        UsageMonthly.objects.create(
            organization=self.org, year_month=self.ym,
            tokens_used=5_000, overage_tokens=0,
        )
        response = self.client.get(self._url(), HTTP_X_ORGANIZATION_TOKEN=self.org_token)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['monthly_token_quota'], 10_000)
        self.assertEqual(data['tokens_used'], 5_000)

    def test_zero_usage_row(self):
        response = self.client.get(self._url(), HTTP_X_ORGANIZATION_TOKEN=self.org_token)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['tokens_used'], 0)
        self.assertEqual(data['overage_tokens'], 0)
        self.assertEqual(data['monthly_token_quota'], 1_000_000)
