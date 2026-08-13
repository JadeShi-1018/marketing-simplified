from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from freezegun import freeze_time

from core.models import Organization, OrganizationActivityEvent


@override_settings(CORE_ORG_ACTIVITY_EVENT_RETENTION_DAYS=30, METRIC_UPLOAD_RECORD_RETENTION_DAYS=None)
class PreviewDataRetentionCommandTest(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Preview Cmd Org", email_domain="preview-cmd.example.com")

    def _make_old_event(self):
        old_time = timezone.now() - timedelta(days=60)
        with freeze_time(old_time):
            return OrganizationActivityEvent.objects.create(
                organization=self.org,
                event_type=OrganizationActivityEvent.EventType.MEMBER_JOINED,
            )

    def test_dry_run_mutates_nothing(self):
        event = self._make_old_event()

        out = StringIO()
        call_command("preview_data_retention", stdout=out)

        self.assertTrue(OrganizationActivityEvent.objects.filter(pk=event.pk).exists())

    def test_output_reports_matched_count_and_dry_run_disclaimer(self):
        self._make_old_event()

        out = StringIO()
        call_command("preview_data_retention", stdout=out)
        output = out.getvalue()

        self.assertIn("core.OrganizationActivityEvent: 1 row(s) matched", output)
        self.assertIn("Dry run only", output)

    def test_skipped_rule_is_rendered_explicitly_not_silently_omitted(self):
        out = StringIO()
        call_command("preview_data_retention", stdout=out)
        output = out.getvalue()

        self.assertIn("metric_upload.MetricFile.record: SKIPPED", output)
        self.assertIn("METRIC_UPLOAD_RECORD_RETENTION_DAYS", output)
