import logging
import os

from django.conf import settings

from core.retention_registry import RetentionRule, registry

logger = logging.getLogger(__name__)

_ITER_CHUNK_SIZE = 500


def _cleanup_metric_files(rule, queryset, dry_run):
    """Remove file bytes from disk for old MetricFile rows not yet cleared
    (base_filter is_deleted=False), then mark them cleared.

    storage_key is entirely server-generated (metric_upload/models.py:
    get_storage_key, read_only on MetricFileSerializer, set once in
    FileUploadView.post()) -- not attacker-influenced. The realpath/
    commonpath containment check below is defense in depth on top of that,
    since this handler performs irreversible deletion.

    Result counters:
        matched          rows eligible for this rule
        deleted          os.remove() actually removed bytes THIS run
        already_missing  bytes were already gone (FileNotFoundError) --
                          desired state reached, but not removed by this run
        errors           any other OSError; row is left uncleared and will
                          be retried on the next run

    `deleted` is therefore an exact count of files this run itself removed,
    not a "desired state reached" count -- that's what already_missing is
    for. Both `deleted` and `already_missing` rows get is_deleted=True,
    since either way the file no longer exists.

    End state is idempotent under a concurrent/duplicate run: a row is only
    flipped to is_deleted after its bytes are confirmed gone (removed by
    this run, or already absent). Per-run counters are still not
    exactly-once ACROSS concurrent runs, though -- two overlapping workers
    racing the same row can split the outcome between them (one gets
    deleted, the other gets already_missing for the same file).
    """
    if dry_run:
        return {"matched": queryset.count(), "deleted": 0, "already_missing": 0, "errors": 0}

    storage_root = os.path.realpath(settings.FILE_STORAGE_DIR)
    matched = 0
    deleted = 0
    already_missing = 0
    errors = 0

    for metric_file in queryset.iterator(chunk_size=_ITER_CHUNK_SIZE):
        matched += 1
        full_path = os.path.realpath(os.path.join(settings.FILE_STORAGE_DIR, metric_file.storage_key))
        if os.path.commonpath([storage_root, full_path]) != storage_root:
            logger.error(
                "sweep_data_retention: refusing to remove out-of-root path for MetricFile id=%s storage_key=%r",
                metric_file.pk, metric_file.storage_key,
            )
            errors += 1
            continue

        try:
            os.remove(full_path)
            deleted += 1
        except FileNotFoundError:
            already_missing += 1  # already gone -- desired state already reached
        except OSError:
            logger.exception(
                "sweep_data_retention: failed to remove file for MetricFile id=%s path=%s",
                metric_file.pk, full_path,
            )
            errors += 1
            continue

        metric_file.is_deleted = True
        metric_file.save(update_fields=["is_deleted", "updated_at"])

    return {"matched": matched, "deleted": deleted, "already_missing": already_missing, "errors": errors}


registry.register(RetentionRule(
    label="metric_upload.MetricFile.file",
    app_label="metric_upload",
    model_name="MetricFile",
    timestamp_field="created_at",
    retention_days_setting="METRIC_UPLOAD_FILE_RETENTION_DAYS",
    description="MetricFile: remove uploaded file bytes from disk (row is kept, marked cleared).",
    base_filter={"is_deleted": False},
    cleanup=_cleanup_metric_files,
))

registry.register(RetentionRule(
    label="metric_upload.MetricFile.record",
    app_label="metric_upload",
    model_name="MetricFile",
    timestamp_field="created_at",
    retention_days_setting="METRIC_UPLOAD_RECORD_RETENTION_DAYS",
    description="MetricFile: hard-delete the DB row once its file bytes are already cleared.",
    base_filter={"is_deleted": True},
))
