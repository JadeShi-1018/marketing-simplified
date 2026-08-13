from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from freezegun import freeze_time

from core.models import Organization, OrganizationActivityEvent
from core.retention_registry import RetentionRegistry, RetentionRule
from core.tasks import _batched_delete, sweep_data_retention

RETENTION_DAYS = 30
RETENTION_SETTING = "TEST_ORG_EVENT_RETENTION_DAYS"


def make_org(name="Test Org"):
    return Organization.objects.create(name=name, email_domain=f"{name.lower().replace(' ', '')}.example.com")


def make_event(org, when):
    with freeze_time(when):
        return OrganizationActivityEvent.objects.create(
            organization=org,
            event_type=OrganizationActivityEvent.EventType.MEMBER_JOINED,
        )


def single_rule_registry(**overrides):
    defaults = dict(
        label="core.OrganizationActivityEvent",
        app_label="core",
        model_name="OrganizationActivityEvent",
        timestamp_field="created_at",
        retention_days_setting=RETENTION_SETTING,
        description="test rule",
    )
    defaults.update(overrides)
    reg = RetentionRegistry()
    reg.register(RetentionRule(**defaults))
    return reg


@override_settings(**{RETENTION_SETTING: RETENTION_DAYS})
class SweepDataRetentionTest(TestCase):
    def setUp(self):
        self.org = make_org()
        patcher = patch("core.tasks.registry", single_rule_registry())
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_dry_run_deletes_nothing_and_matches_count(self):
        now = timezone.now()
        old_time = now - timedelta(days=RETENTION_DAYS + 5)
        new_time = now - timedelta(days=5)

        make_event(self.org, old_time)
        make_event(self.org, old_time)
        make_event(self.org, new_time)

        with freeze_time(now):
            result = sweep_data_retention(dry_run=True)

        rule_result = result["rules"]["core.OrganizationActivityEvent"]
        self.assertEqual(rule_result["matched"], 2)
        self.assertEqual(rule_result["deleted"], 0)
        self.assertEqual(OrganizationActivityEvent.objects.count(), 3)

    def test_real_run_deletes_only_past_cutoff(self):
        now = timezone.now()
        old_time = now - timedelta(days=RETENTION_DAYS + 5)
        new_time = now - timedelta(days=5)

        make_event(self.org, old_time)
        make_event(self.org, old_time)
        new_event = make_event(self.org, new_time)

        with freeze_time(now):
            result = sweep_data_retention(dry_run=False)

        rule_result = result["rules"]["core.OrganizationActivityEvent"]
        self.assertEqual(rule_result["matched"], 2)
        self.assertEqual(rule_result["deleted"], 2)
        self.assertEqual(OrganizationActivityEvent.objects.count(), 1)
        self.assertTrue(OrganizationActivityEvent.objects.filter(pk=new_event.pk).exists())

    def test_batch_loop_drains_all_matches(self):
        now = timezone.now()
        old_time = now - timedelta(days=RETENTION_DAYS + 5)

        for _ in range(7):
            make_event(self.org, old_time)

        with patch("core.tasks._RETENTION_BATCH_SIZE", 3), freeze_time(now):
            result = sweep_data_retention(dry_run=False)

        rule_result = result["rules"]["core.OrganizationActivityEvent"]
        self.assertEqual(rule_result["matched"], 7)
        self.assertEqual(rule_result["deleted"], 7)
        self.assertEqual(OrganizationActivityEvent.objects.count(), 0)

    def test_rerunning_after_delete_is_a_safe_no_op(self):
        now = timezone.now()
        old_time = now - timedelta(days=RETENTION_DAYS + 5)
        make_event(self.org, old_time)

        with freeze_time(now):
            first = sweep_data_retention(dry_run=False)
            second = sweep_data_retention(dry_run=False)

        self.assertEqual(first["rules"]["core.OrganizationActivityEvent"]["deleted"], 1)
        self.assertEqual(second["rules"]["core.OrganizationActivityEvent"]["deleted"], 0)


class SweepDataRetentionSkipTest(TestCase):
    def test_unconfigured_setting_is_reported_as_skipped(self):
        reg = single_rule_registry(retention_days_setting="SETTING_THAT_DOES_NOT_EXIST")
        with patch("core.tasks.registry", reg):
            result = sweep_data_retention(dry_run=True)

        rule_result = result["rules"]["core.OrganizationActivityEvent"]
        self.assertTrue(rule_result["skipped"])
        self.assertIn("SETTING_THAT_DOES_NOT_EXIST", rule_result["reason"])

    def test_unknown_model_is_reported_as_skipped(self):
        reg = single_rule_registry(
            label="core.NoSuchModel",
            model_name="NoSuchModel",
            retention_days_setting=RETENTION_SETTING,
        )
        with patch("core.tasks.registry", reg), override_settings(**{RETENTION_SETTING: RETENTION_DAYS}):
            result = sweep_data_retention(dry_run=True)

        rule_result = result["rules"]["core.NoSuchModel"]
        self.assertTrue(rule_result["skipped"])
        self.assertIn("not found", rule_result["reason"])


class BatchedDeleteCascadeCountTest(TestCase):
    """_batched_delete's `deleted` count must reflect only the target
    model's own rows, not rows cascade-deleted from related models."""

    def test_deleted_count_excludes_cascaded_rows(self):
        org = make_org()
        make_event(org, timezone.now())
        make_event(org, timezone.now())
        make_event(org, timezone.now())
        self.assertEqual(OrganizationActivityEvent.objects.count(), 3)

        result = _batched_delete(Organization, Organization.objects.filter(pk=org.pk))

        self.assertEqual(result["matched"], 1)
        self.assertEqual(result["deleted"], 1)  # only the Organization row, not the 3 cascaded events
        self.assertEqual(Organization.objects.filter(pk=org.pk).count(), 0)
        self.assertEqual(OrganizationActivityEvent.objects.count(), 0)  # cascade did happen
