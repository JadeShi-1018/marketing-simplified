"""Celery tasks for core app.

Includes reencrypt_secret_fields — a maintenance task used during key rotation
to migrate existing ciphertext to the current active key.
"""

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from core.models import DataExportRequest
from core.crypto import DecryptionError, decrypt_token, encrypt_token, needs_rotation
from core.retention_registry import registry
from core.services.privacy_export import assemble_data_export_zip

logger = logging.getLogger(__name__)

_RETENTION_BATCH_SIZE = 5000


# ---------------------------------------------------------------------------
# Registry: every model + fields that hold encrypted tokens.
#
# WHY A REGISTRY?
# ---------------
# Instead of writing a separate loop for each app, we describe ALL encrypted
# fields in one place.  Adding a new integration in the future means adding
# one entry here — nothing else changes.
#
# Each entry is a tuple of:
#   (app_label, ModelName, [list_of_encrypted_field_names])
# ---------------------------------------------------------------------------

_ENCRYPTED_FIELDS = [
    ("facebook_integration", "FacebookConnection",     ["encrypted_access_token"]),
    ("zoom_integration",     "ZoomCredential",         ["encrypted_access_token", "encrypted_refresh_token"]),
    ("linear_integration",   "LinearCredential",       ["encrypted_access_token"]),
    ("google_docs_integration",      "GoogleDocsConnection",     ["encrypted_access_token", "encrypted_refresh_token"]),
    ("google_calendar_integration",  "GoogleCalendarConnection", ["encrypted_access_token", "encrypted_refresh_token"]),
    ("slack_integration",    "SlackWorkspaceConnection", ["encrypted_access_token"]),
]


# ---------------------------------------------------------------------------
# The task
# ---------------------------------------------------------------------------

@shared_task(
    bind=True,
    max_retries=0,         # key-rotation jobs should not silently retry on failure
    ignore_result=False,   # we want the caller to be able to check the summary
    name="core.tasks.reencrypt_secret_fields",
)
def reencrypt_secret_fields(self, batch_size: int = 500) -> dict:
    """Re-encrypt all secret fields using the current active key.

    WHY THIS TASK EXISTS
    --------------------
    When a key rotation happens (a new key is added to FIELD_ENCRYPTION_KEYS),
    old rows in the database still hold ciphertext from the previous key.
    They remain *readable* because core.crypto tries all keys on decryption,
    but they are NOT yet using the new active key.

    This task finishes the rotation: it reads every row, checks whether the
    token is already on the active key, and re-encrypts only the ones that
    are not.  Once this task completes, the old key can be safely removed
    from FIELD_ENCRYPTION_KEYS.

    HOW TO USE (key rotation playbook)
    -----------------------------------
    1.  Generate a new key:
            python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    2.  Prepend it to FIELD_ENCRYPTION_KEYS in the environment, e.g.:
            FIELD_ENCRYPTION_KEYS=v2:<new_key>,v1:<old_key>
    3.  Deploy the new environment (no downtime — old ciphertext still readable).
    4.  Run this task (via Celery or django-admin shell):
            from core.tasks import reencrypt_secret_fields
            reencrypt_secret_fields.delay()
    5.  Wait for the task to finish.  Check the return value for any failures.
    6.  Once skipped_count == 0 everywhere, remove v1:<old_key> from the setting.

    Returns
    -------
    dict with per-model counts:
        {
          "FacebookConnection": {"reencrypted": 3, "skipped": 10, "errors": 0},
          ...
          "total": {"reencrypted": N, "skipped": M, "errors": K},
        }
    """
    from django.apps import apps as django_apps

    summary = {}
    total_reencrypted = 0
    total_skipped = 0
    total_errors = 0

    for app_label, model_name, fields in _ENCRYPTED_FIELDS:
        try:
            Model = django_apps.get_model(app_label, model_name)
        except LookupError:
            logger.warning("reencrypt_secret_fields: model %s.%s not found — skipping.", app_label, model_name)
            continue

        reencrypted = 0
        skipped = 0
        errors = 0

        # iterator(chunk_size=...) fetches rows in batches from the DB instead
        # of loading the entire table into RAM at once.
        #
        # WHY BATCHING MATTERS:
        # A production database may have millions of rows.  Loading them all at
        # once would cause the Python process to run out of memory (OOM).
        # Batching keeps memory usage roughly constant regardless of table size.
        for obj in Model.objects.all().iterator(chunk_size=batch_size):
            changed_fields = []

            for field_name in fields:
                current_value = getattr(obj, field_name) or ""

                if not current_value:
                    continue  # no token stored — nothing to do

                if not needs_rotation(current_value):
                    skipped += 1
                    continue  # already on the active key — no work needed

                # The token exists and is on an old key → re-encrypt it.
                try:
                    plaintext = decrypt_token(current_value)
                    if plaintext is None:
                        skipped += 1
                        continue

                    new_value = encrypt_token(plaintext)
                    setattr(obj, field_name, new_value)
                    changed_fields.append(field_name)
                    reencrypted += 1

                except DecryptionError:
                    # Ciphertext exists but we cannot decrypt it.
                    # Log it and move on — DO NOT clear the field (that would
                    # silently destroy the user's connection).
                    logger.error(
                        "reencrypt_secret_fields: cannot decrypt %s.%s for pk=%s — skipping row.",
                        model_name, field_name, obj.pk,
                    )
                    errors += 1

            if changed_fields:
                # update_fields tells Django to issue a targeted UPDATE statement
                # (UPDATE ... SET field_a=..., field_b=... WHERE id=...)
                # instead of a full-table UPDATE.  More efficient and safer.
                obj.save(update_fields=changed_fields)

        model_result = {"reencrypted": reencrypted, "skipped": skipped, "errors": errors}
        summary[model_name] = model_result
        logger.info(
            "reencrypt_secret_fields [%s]: reencrypted=%d, skipped=%d, errors=%d",
            model_name, reencrypted, skipped, errors,
        )

        total_reencrypted += reencrypted
        total_skipped += skipped
        total_errors += errors

    summary["total"] = {
        "reencrypted": total_reencrypted,
        "skipped": total_skipped,
        "errors": total_errors,
    }

    logger.info(
        "reencrypt_secret_fields DONE — total reencrypted=%d, skipped=%d, errors=%d",
        total_reencrypted, total_skipped, total_errors,
    )
    return summary


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def assemble_personal_data_export(self, export_request_id):
    try:
        export_request = DataExportRequest.objects.select_related("user").get(pk=export_request_id)
    except DataExportRequest.DoesNotExist:
        logger.warning("Data export request %s does not exist", export_request_id)
        return

    export_request.status = DataExportRequest.Status.PROCESSING
    export_request.save(update_fields=["status", "updated_at"])

    try:
        assemble_data_export_zip(export_request)
    except Exception as exc:
        logger.exception("Failed to assemble data export %s", export_request_id)
        export_request.status = DataExportRequest.Status.FAILED
        export_request.failure_reason = str(exc)
        export_request.completed_at = timezone.now()
        export_request.save(update_fields=["status", "failure_reason", "completed_at", "updated_at"])
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Data retention (MED-341)
#
# Each app registers its own RetentionRule(s) with core.retention_registry
# (see e.g. core/retention_rules.py, meetings/retention_rules.py) via its
# AppConfig.ready(). This task is the single generic executor: it just
# iterates whatever has been registered and knows nothing about individual
# apps' models.
#
# No overlap lock for the default (no-custom-cleanup) path: the generic
# batched-delete loop is naturally idempotent under concurrent/duplicate
# runs — deleting already-deleted ids is a no-op (0 rows affected), the same
# reasoning tracking.tasks.purge_old_data already relies on with zero
# locking. A rule with a custom `cleanup` handler (e.g. MetricFile's
# filesystem cleanup) does NOT get this guarantee for free — the handler
# itself is responsible for staying idempotent under a duplicate/concurrent
# run (see metric_upload/retention_rules.py for how the file-cleanup handler
# does this: FileNotFoundError counts as success, and the row is only
# flipped to is_deleted after the file is actually gone).
# ---------------------------------------------------------------------------

def _batched_delete(Model, queryset) -> dict:
    """Delete queryset in batches of _RETENTION_BATCH_SIZE. Mirrors
    tracking.tasks.purge_old_data's id-slice-then-delete loop.

    `deleted` counts only rows of `Model` itself, not any rows cascade-deleted
    from related models — QuerySet.delete()'s return value is a
    (total_count, {label: count}) pair where total_count includes cascades,
    so we pull the target model's own count out of the per-model breakdown.
    """
    model_label = f"{Model._meta.app_label}.{Model._meta.object_name}"
    matched = 0
    deleted = 0
    while True:
        ids = list(queryset.values_list("pk", flat=True)[:_RETENTION_BATCH_SIZE])
        if not ids:
            break
        matched += len(ids)
        _, breakdown = Model.objects.filter(pk__in=ids).delete()
        deleted += breakdown.get(model_label, 0)
    return {"matched": matched, "deleted": deleted}


@shared_task(name="core.tasks.sweep_data_retention")
def sweep_data_retention(dry_run: bool = False) -> dict:
    """Run every registered RetentionRule.

    dry_run=True performs zero writes (DB or filesystem) — it only reports
    what a real run would do right now. It is a point-in-time preview, not a
    frozen plan: it shares the exact same cutoff/eligibility logic as a real
    run, so a later real run may legitimately report a different matched
    count if more rows crossed the cutoff in the meantime. Real runs always
    recompute eligibility at execution time rather than reusing a prior
    preview's numbers.
    """
    from django.apps import apps as django_apps

    now = timezone.now()
    summary = {"executed_at": now.isoformat(), "dry_run": dry_run, "rules": {}}

    for rule in registry.all():
        days = getattr(settings, rule.retention_days_setting, None)
        if days is None:
            logger.warning(
                "sweep_data_retention: %s has no value for settings.%s — skipping.",
                rule.label, rule.retention_days_setting,
            )
            summary["rules"][rule.label] = {
                "skipped": True,
                "reason": f"no value configured for settings.{rule.retention_days_setting}",
            }
            continue

        try:
            Model = django_apps.get_model(rule.app_label, rule.model_name)
        except LookupError:
            logger.warning("sweep_data_retention: model %s.%s not found — skipping.",
                            rule.app_label, rule.model_name)
            summary["rules"][rule.label] = {
                "skipped": True,
                "reason": f"model {rule.app_label}.{rule.model_name} not found",
            }
            continue

        cutoff = now - timedelta(days=days)
        qs = Model.objects.filter(**{f"{rule.timestamp_field}__lt": cutoff}, **rule.base_filter)

        if rule.cleanup is not None:
            result = rule.cleanup(rule, qs, dry_run)
        elif dry_run:
            result = {"matched": qs.count(), "deleted": 0}
        else:
            result = _batched_delete(Model, qs)

        result["cutoff"] = cutoff.isoformat()
        result["retention_days"] = days
        logger.info(
            "sweep_data_retention: rule=%s dry_run=%s cutoff=%s matched=%d deleted=%d",
            rule.label, dry_run, cutoff.isoformat(), result["matched"], result["deleted"],
        )
        summary["rules"][rule.label] = result

    return summary
