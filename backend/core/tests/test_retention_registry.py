from django.test import SimpleTestCase

from core.retention_registry import RetentionRegistry, RetentionRule, registry as production_registry


def make_rule(label="app.Model", **overrides):
    defaults = dict(
        label=label,
        app_label="app",
        model_name="Model",
        timestamp_field="created_at",
        retention_days_setting="APP_MODEL_RETENTION_DAYS",
        description="test rule",
    )
    defaults.update(overrides)
    return RetentionRule(**defaults)


class RetentionRegistryTest(SimpleTestCase):
    def test_register_and_all(self):
        reg = RetentionRegistry()
        rule = make_rule()
        reg.register(rule)
        self.assertEqual(reg.all(), [rule])

    def test_duplicate_registration_keeps_first_and_warns(self):
        reg = RetentionRegistry()
        first = make_rule(description="first")
        second = make_rule(description="second")

        reg.register(first)
        with self.assertLogs("core.retention_registry", level="WARNING") as cm:
            reg.register(second)

        self.assertEqual(reg.all(), [first])
        self.assertIn("already registered", cm.output[0])

    def test_all_returns_empty_list_for_fresh_registry(self):
        reg = RetentionRegistry()
        self.assertEqual(reg.all(), [])


class ProductionRegistryTest(SimpleTestCase):
    """Smoke test: each app's retention_rules module is actually imported via
    its AppConfig.ready() and lands in the shared production registry."""

    def test_expected_labels_are_registered(self):
        labels = {rule.label for rule in production_registry.all()}
        self.assertEqual(
            labels,
            {
                "core.OrganizationActivityEvent",
                "meetings.MeetingAuditLog",
                "customer.CustomerInternalNoteAuditLog",
                "metric_upload.MetricFile.file",
            },
        )

    def test_metric_file_file_rule_has_custom_cleanup(self):
        rule = next(r for r in production_registry.all() if r.label == "metric_upload.MetricFile.file")
        self.assertIsNotNone(rule.cleanup)
        self.assertEqual(rule.base_filter, {"is_deleted": False})
