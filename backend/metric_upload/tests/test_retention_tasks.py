import os
import shutil
import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from core.tasks import sweep_data_retention
from metric_upload.models import MetricFile

User = get_user_model()

FILE_RETENTION_DAYS = 30


class MetricFileRetentionTestBase(TestCase):
    def setUp(self):
        self.storage_dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.storage_dir, ignore_errors=True)

        self.settings_override = override_settings(
            FILE_STORAGE_DIR=self.storage_dir,
            METRIC_UPLOAD_FILE_RETENTION_DAYS=FILE_RETENTION_DAYS,
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
        self.assertTrue(MetricFile.objects.filter(pk=mf.pk).exists())
        file_result = result['rules']['metric_upload.MetricFile.file']
        self.assertEqual(file_result['matched'], 1)
        self.assertEqual(file_result['deleted'], 0)
        self.assertEqual(file_result['already_missing'], 0)

    def test_real_run_removes_file_and_deletes_row(self):
        old = timezone.now() - timedelta(days=FILE_RETENTION_DAYS + 5)
        mf = self.make_metric_file('metrics_files/old2.txt', old)
        full_path = self._write_file('metrics_files/old2.txt')

        result = sweep_data_retention(dry_run=False)

        self.assertFalse(os.path.exists(full_path))
        self.assertFalse(MetricFile.objects.filter(pk=mf.pk).exists())
        file_result = result['rules']['metric_upload.MetricFile.file']
        # a real file existed and os.remove() actually removed it this run
        self.assertEqual(file_result['deleted'], 1)
        self.assertEqual(file_result['already_missing'], 0)
        self.assertEqual(file_result['errors'], 0)

    def test_missing_file_on_disk_still_deletes_row(self):
        old = timezone.now() - timedelta(days=FILE_RETENTION_DAYS + 5)
        mf = self.make_metric_file('metrics_files/never_written.txt', old)
        # deliberately no _write_file() call -- the file is genuinely absent

        result = sweep_data_retention(dry_run=False)

        self.assertFalse(MetricFile.objects.filter(pk=mf.pk).exists())
        file_result = result['rules']['metric_upload.MetricFile.file']
        # nothing was removed by THIS run -- the desired state was already true
        self.assertEqual(file_result['deleted'], 0)
        self.assertEqual(file_result['already_missing'], 1)
        self.assertEqual(file_result['errors'], 0)

    def test_oserror_leaves_row_in_place_and_retryable(self):
        old = timezone.now() - timedelta(days=FILE_RETENTION_DAYS + 5)
        mf = self.make_metric_file('metrics_files/perm_denied.txt', old)
        self._write_file('metrics_files/perm_denied.txt')

        with patch('metric_upload.retention_rules.os.remove', side_effect=PermissionError('denied')):
            result = sweep_data_retention(dry_run=False)

        self.assertTrue(MetricFile.objects.filter(pk=mf.pk).exists())
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
        self.assertTrue(MetricFile.objects.filter(pk=mf.pk).exists())
        file_result = result['rules']['metric_upload.MetricFile.file']
        self.assertEqual(file_result['deleted'], 0)
        self.assertEqual(file_result['already_missing'], 0)
        self.assertEqual(file_result['errors'], 1)
