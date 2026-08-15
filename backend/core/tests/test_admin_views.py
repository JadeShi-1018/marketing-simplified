from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from core.admin_utils import assign_org_admin
from core.models import Organization

User = get_user_model()

EXPECTED_LABELS = {
    "core.OrganizationActivityEvent",
    "meetings.MeetingAuditLog",
    "customer.CustomerInternalNoteAuditLog",
    "metric_upload.MetricFile.file",
}


class RetentionPolicyListViewTest(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Retention Test Org", email_domain="retention-test.example.com")
        self.url = reverse("admin-retention-policies")

    def test_anonymous_user_is_rejected(self):
        response = self.client.get(self.url)
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_non_admin_user_gets_403(self):
        user = User.objects.create_user(username="member", email="member@test.com", organization=self.org)
        self.client.force_authenticate(user=user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(CORE_ORG_ACTIVITY_EVENT_RETENTION_DAYS=365)
    def test_org_admin_gets_200_with_every_registered_rule(self):
        admin_user = User.objects.create_user(username="admin", email="admin@test.com", organization=self.org)
        assign_org_admin(admin_user, self.org)
        self.client.force_authenticate(user=admin_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        labels = {row["label"] for row in response.data}
        self.assertEqual(labels, EXPECTED_LABELS)

        by_label = {row["label"]: row for row in response.data}
        # A configured rule reports the real integer window pinned above, not
        # whatever settings.py's default happens to be today.
        self.assertEqual(by_label["core.OrganizationActivityEvent"]["retention_days"], 365)

    def test_response_has_no_delete_or_toggle_affordance_fields(self):
        """The endpoint is read-only -- the ticket explicitly needs no
        user-facing toggles. This is a light contract check that the
        serialized shape only ever exposes descriptive fields."""
        admin_user = User.objects.create_user(username="admin2", email="admin2@test.com", organization=self.org)
        assign_org_admin(admin_user, self.org)
        self.client.force_authenticate(user=admin_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        allowed_keys = {
            "label", "description", "app_label", "model_name",
            "timestamp_field", "retention_days_setting", "retention_days",
        }
        for row in response.data:
            self.assertEqual(set(row.keys()), allowed_keys)
