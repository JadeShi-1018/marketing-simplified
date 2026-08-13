from core.retention_registry import RetentionRule, registry

registry.register(RetentionRule(
    label="core.OrganizationActivityEvent",
    app_label="core",
    model_name="OrganizationActivityEvent",
    timestamp_field="created_at",
    retention_days_setting="CORE_ORG_ACTIVITY_EVENT_RETENTION_DAYS",
    description="Organization activity/audit events.",
))
