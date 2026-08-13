from core.retention_registry import RetentionRule, registry

registry.register(RetentionRule(
    label="customer.CustomerInternalNoteAuditLog",
    app_label="customer",
    model_name="CustomerInternalNoteAuditLog",
    timestamp_field="timestamp",
    retention_days_setting="CUSTOMER_NOTE_AUDIT_LOG_RETENTION_DAYS",
    description="Customer internal note audit log entries.",
))
