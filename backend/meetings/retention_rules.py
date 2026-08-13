from core.retention_registry import RetentionRule, registry

registry.register(RetentionRule(
    label="meetings.MeetingAuditLog",
    app_label="meetings",
    model_name="MeetingAuditLog",
    timestamp_field="timestamp",
    retention_days_setting="MEETINGS_AUDIT_LOG_RETENTION_DAYS",
    description="Meeting audit log entries (status/agenda/decision/task mutations).",
))
