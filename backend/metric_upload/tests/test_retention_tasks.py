import os
import shutil
import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from core.retention_registry import RetentionRegistry, registry as production_registry
from core.tasks import sweep_data_retention
from metric_upload.models import MetricFile

User = get_user_model()

FILE_RETENTION_DAYS = 30
RECORD_RETENTION_DAYS = 90


def record_only_registry():
    """A registry containing only the MetricFile.record rule, isolated from
    the file-cleanup rule, so the record stage's own filtering (cutoff +
    is_deleted=True) can be tested without same-sweep progression from the
    file stage (see MetricFileSameSweepProgressionTest for that behavior)."""
    reg = RetentionRegistry()
    record_rule = next(r for r in production_registry.all() if r.label == "metric_upload.MetricFile.record")
    reg.register(record_rule)
    return reg


class MetricFileRetentionTestBase(TestCase):
    def setUp(self):
        self.storage_dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.storage_dir, ignore_errors=True)

        self.settings_override = override_settings(
            FILE_STORAGE_DIR=self.storage_dir,
            METRIC_UPLOAD_FILE_RETENTION_DAYS=FILE_RETENTION_DAYS,
            METRIC_UPLOAD_RECORD_RETENTION_DAYS=RECORD_RETENTION_DAYS,
        )
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

        self.user = User.objects.create_user(username='uploader', email='uploader@test.com', password='pass')

    def _write_file(self, storage_key, content=b"hello"):
        """Write a real file under the temp FILE_STORAGE_DIR at storage_key."""
        full_path = os.path.join(self.storage_dir, storage_key)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'wb') as f:
            f.write(content)
        return full_path

    def make_metric_file(self, storage_key, created_at, is_deleted=False):
        # created_at has default=timezone.now (metric_upload/models.py:32),
        # not auto_now_add, so an explicit kwarg here is honored as-is.
        return MetricFile.objects.create(
            mime_type='text/plain',
            size=5,
            storage_key=storage_key,
            original_filename='test.txt',
            uploaded_by=self.user,
            created_at=created_at,
            is_deleted=is_deleted,
        )


class MetricFileFileStageTest(MetricFileRetentionTestBase):
    def test_dry_run_removes_no_files_and_flips_no_flags(self):
        old = timezone.now() - timedelta(days=FILE_RETENTION_DAYS + 5)
        mf = self.make_metric_file('metrics_files/old.txt', old)
        full_path = self._write_file('metrics_files/old.txt')

        result = sweep_data_retention(dry_run=True)

        self.assertTrue(os.path.exists(full_path))
        mf.refresh_from_db()
        self.assertFalse(mf.is_deleted)
        file_result = result['rules']['metric_upload.MetricFile.file']
        self.assertEqual(file_result['matched'], 1)
        self.assertEqual(file_result['deleted'], 0)
        self.assertEqual(file_result['already_missing'], 0)

    def test_real_run_removes_file_and_marks_cleared(self):
        old = timezone.now() - timedelta(days=FILE_RETENTION_DAYS + 5)
        mf = self.make_metric_file('metrics_files/old2.txt', old)
        full_path = self._write_file('metrics_files/old2.txt')

        result = sweep_data_retention(dry_run=False)

        self.assertFalse(os.path.exists(full_path))
        mf.refresh_from_db()
        self.assertTrue(mf.is_deleted)
        file_result = result['rules']['metric_upload.MetricFile.file']
        # a real file existed and os.remove() actually removed it this run
        self.assertEqual(file_result['deleted'], 1)
        self.assertEqual(file_result['already_missing'], 0)
        self.assertEqual(file_result['errors'], 0)

    def test_missing_file_on_disk_still_marks_cleared(self):
        old = timezone.now() - timedelta(days=FILE_RETENTION_DAYS + 5)
        mf = self.make_metric_file('metrics_files/never_written.txt', old)
        # deliberately no _write_file() call -- the file is genuinely absent

        result = sweep_data_retention(dry_run=False)

        mf.refresh_from_db()
        self.assertTrue(mf.is_deleted)
        file_result = result['rules']['metric_upload.MetricFile.file']
        # nothing was removed by THIS run -- the desired state was already true
        self.assertEqual(file_result['deleted'], 0)
        self.assertEqual(file_result['already_missing'], 1)
        self.assertEqual(file_result['errors'], 0)

    def test_oserror_leaves_row_uncleared_and_retryable(self):
        old = timezone.now() - timedelta(days=FILE_RETENTION_DAYS + 5)
        mf = self.make_metric_file('metrics_files/perm_denied.txt', old)
        self._write_file('metrics_files/perm_denied.txt')

        with patch('metric_upload.retention_rules.os.remove', side_effect=PermissionError('denied')):
            result = sweep_data_retention(dry_run=False)

        mf.refresh_from_db()
        self.assertFalse(mf.is_deleted)
        file_result = result['rules']['metric_upload.MetricFile.file']
        self.assertEqual(file_result['deleted'], 0)
        self.assertEqual(file_result['already_missing'], 0)
        self.assertEqual(file_result['errors'], 1)

    def test_already_cleared_row_is_not_reprocessed(self):
        old = timezone.now() - timedelta(days=FILE_RETENTION_DAYS + 5)
        self.make_metric_file('metrics_files/already_cleared.txt', old, is_deleted=True)

        result = sweep_data_retention(dry_run=False)

        file_result = result['rules']['metric_upload.MetricFile.file']
        self.assertEqual(file_result['matched'], 0)

    def test_containment_check_blocks_escape_and_does_not_call_os_remove(self):
        # storage_key cannot actually hold '..' in production (it is entirely
        # server-generated -- see retention_rules.py's docstring), but the
        # containment check is defense in depth. Verify it fires if a row
        # somehow holds an out-of-root value, and that os.remove is never
        # reached for it.
        old = timezone.now() - timedelta(days=FILE_RETENTION_DAYS + 5)
        mf = MetricFile.objects.create(
            mime_type='text/plain',
            size=5,
            storage_key='../../etc/passwd',
            original_filename='test.txt',
            uploaded_by=self.user,
            created_at=old,
        )

        with patch('metric_upload.retention_rules.os.remove') as mock_remove:
            result = sweep_data_retention(dry_run=False)

        mock_remove.assert_not_called()
        mf.refresh_from_db()
        self.assertFalse(mf.is_deleted)
        file_result = result['rules']['metric_upload.MetricFile.file']
        self.assertEqual(file_result['deleted'], 0)
        self.assertEqual(file_result['already_missing'], 0)
        self.assertEqual(file_result['errors'], 1)


class MetricFileRecordStageTest(MetricFileRetentionTestBase):
    """Record rule tested in isolation (file rule excluded from the
    registry) so its own cutoff/is_deleted=True filtering is verified
    without the file rule's same-sweep progression -- see
    MetricFileSameSweepProgressionTest for that combined behavior."""

    def test_only_deletes_rows_already_cleared(self):
        old = timezone.now() - timedelta(days=RECORD_RETENTION_DAYS + 5)
        cleared_old = self.make_metric_file('metrics_files/cleared_old.txt', old, is_deleted=True)
        not_cleared_old = self.make_metric_file('metrics_files/not_cleared_old.txt', old, is_deleted=False)

        with patch('core.tasks.registry', record_only_registry()):
            result = sweep_data_retention(dry_run=False)

        self.assertFalse(MetricFile.objects.filter(pk=cleared_old.pk).exists())
        self.assertTrue(MetricFile.objects.filter(pk=not_cleared_old.pk).exists())
        record_result = result['rules']['metric_upload.MetricFile.record']
        self.assertEqual(record_result['matched'], 1)
        self.assertEqual(record_result['deleted'], 1)

    def test_respects_its_own_cutoff(self):
        recent = timezone.now() - timedelta(days=RECORD_RETENTION_DAYS - 5)
        cleared_but_recent = self.make_metric_file('metrics_files/recent_cleared.txt', recent, is_deleted=True)

        with patch('core.tasks.registry', record_only_registry()):
            result = sweep_data_retention(dry_run=False)

        self.assertTrue(MetricFile.objects.filter(pk=cleared_but_recent.pk).exists())
        record_result = result['rules']['metric_upload.MetricFile.record']
        self.assertEqual(record_result['matched'], 0)


class MetricFileSameSweepProgressionTest(MetricFileRetentionTestBase):
    """Both cutoffs measure age since created_at (upload time) -- there is
    no separate file_deleted_at timestamp. So a row already older than BOTH
    cutoffs when first swept progresses through both stages in the same
    sweep_data_retention() call: the file rule clears it (removes bytes,
    flips is_deleted=True), then the record rule's queryset -- evaluated
    fresh, after that update, later in the same call -- matches it too and
    hard-deletes the row. This is intentional given the design, not a bug."""

    def test_row_older_than_both_cutoffs_is_fully_deleted_in_one_sweep(self):
        very_old = timezone.now() - timedelta(days=RECORD_RETENTION_DAYS + 5)
        self.assertGreater(RECORD_RETENTION_DAYS, FILE_RETENTION_DAYS)
        mf = self.make_metric_file('metrics_files/very_old.txt', very_old, is_deleted=False)
        self._write_file('metrics_files/very_old.txt')

        result = sweep_data_retention(dry_run=False)  # full production registry: file rule, then record rule

        self.assertFalse(MetricFile.objects.filter(pk=mf.pk).exists())
        self.assertEqual(result['rules']['metric_upload.MetricFile.file']['deleted'], 1)
        self.assertEqual(result['rules']['metric_upload.MetricFile.file']['already_missing'], 0)
        self.assertEqual(result['rules']['metric_upload.MetricFile.record']['deleted'], 1)

    def test_row_between_the_two_cutoffs_only_progresses_through_file_stage(self):
        """The common steady-state case with a daily sweep cadence: a row
        crosses the (shorter) file cutoff well before it crosses the
        (longer) record cutoff, so it survives this sweep as a cleared row
        and only becomes record-eligible on a later sweep."""
        between = timezone.now() - timedelta(days=FILE_RETENTION_DAYS + 5)
        self.assertLess(FILE_RETENTION_DAYS + 5, RECORD_RETENTION_DAYS)
        mf = self.make_metric_file('metrics_files/between.txt', between, is_deleted=False)
        self._write_file('metrics_files/between.txt')

        result = sweep_data_retention(dry_run=False)

        self.assertTrue(MetricFile.objects.filter(pk=mf.pk).exists())
        mf.refresh_from_db()
        self.assertTrue(mf.is_deleted)
        self.assertEqual(result['rules']['metric_upload.MetricFile.file']['deleted'], 1)
        self.assertEqual(result['rules']['metric_upload.MetricFile.record']['deleted'], 0)


class MetricFileRecordRetentionUnsetTest(TestCase):
    def test_unset_record_retention_setting_skips_record_stage_only(self):
        storage_dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, storage_dir, ignore_errors=True)
        user = User.objects.create_user(username='uploader2', email='uploader2@test.com', password='pass')

        with override_settings(
            FILE_STORAGE_DIR=storage_dir,
            METRIC_UPLOAD_FILE_RETENTION_DAYS=FILE_RETENTION_DAYS,
            METRIC_UPLOAD_RECORD_RETENTION_DAYS=None,
        ):
            old = timezone.now() - timedelta(days=FILE_RETENTION_DAYS + 5)
            MetricFile.objects.create(
                mime_type='text/plain', size=5, storage_key='metrics_files/x.txt',
                original_filename='x.txt', uploaded_by=user, created_at=old,
            )
            result = sweep_data_retention(dry_run=True)

        file_result = result['rules']['metric_upload.MetricFile.file']
        record_result = result['rules']['metric_upload.MetricFile.record']
        self.assertFalse(file_result.get('skipped', False))
        self.assertEqual(file_result['deleted'], 0)
        self.assertEqual(file_result['already_missing'], 0)
        self.assertTrue(record_result['skipped'])
