import logging
from dataclasses import dataclass, field
from typing import Callable, Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RetentionRule:
    """Declares one model's data-retention policy.

    label: unique key, e.g. "core.OrganizationActivityEvent".
    retention_days_setting: name of the Django setting holding the configured
        window (resolved at sweep time, not at registration time, so tests
        can override it via @override_settings).
    base_filter: extra fixed filter kwargs applied alongside the cutoff
        (e.g. {"is_deleted": True} to require another stage has already run).
    cleanup: optional custom handler, cleanup(rule, queryset, dry_run) -> dict
        with at least {"matched": int, "deleted": int}. If None, the generic
        executor runs the default batched filter-and-delete loop.
    """

    label: str
    app_label: str
    model_name: str
    timestamp_field: str
    retention_days_setting: str
    description: str
    base_filter: dict = field(default_factory=dict)
    cleanup: Optional[Callable[["RetentionRule", object, bool], dict]] = None


class RetentionRegistry:
    def __init__(self):
        self._rules: dict[str, RetentionRule] = {}

    def register(self, rule: RetentionRule) -> None:
        # Idempotent by design, matching tracking/schema_registry.py's
        # SchemaRegistry.register() (plain dict assignment). AppConfig.ready()
        # only runs once per process under normal Django/Celery startup, but
        # keeping this a no-op (first registration wins) on a duplicate label
        # avoids crashing app startup if some future code path imports a
        # registration module more than once.
        if rule.label in self._rules:
            logger.warning(
                "RetentionRegistry: %s already registered — keeping first registration.",
                rule.label,
            )
            return
        self._rules[rule.label] = rule

    def all(self) -> list[RetentionRule]:
        return list(self._rules.values())


registry = RetentionRegistry()
