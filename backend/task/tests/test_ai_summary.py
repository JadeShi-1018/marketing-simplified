"""
Tests for the Task AI summary feature:
  - invalidate_task_ai_cache utility
  - ai_summary view  (POST /api/tasks/<id>/ai-summary/)
  - ai_qa view       (POST /api/tasks/<id>/ai-qa/)
  - cache invalidation triggered by comments, attachments, and status changes
  - updated_at field present in task serializer response
"""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Organization, Project, ProjectMember
from task.models import Task, TaskComment

User = get_user_model()

# Cache key pattern mirrors ai_summary.py
_CACHE_PREFIX = "task_ai_cache"

_SUMMARY_FIXTURE = {
    "key_decisions": ["Decision A"],
    "blockers": [],
    "escalations": [],
    "action_items": ["Do the thing"],
    "status_changes": [],
    "unresolved_questions": ["Open question?"],
    "_attachments": [],
}


class _BaseTaskTest(APITestCase):
    """Shared setUp for all AI summary tests."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="user@example.com",
            username="user",
            password="testpass123",
        )
        self.org = Organization.objects.create(name="Test Org")
        self.project = Project.objects.create(
            name="Test Project",
            organization=self.org,
        )
        ProjectMember.objects.create(
            user=self.user,
            project=self.project,
            role="Team Leader",
            is_active=True,
        )
        self.user.active_project = self.project
        self.user.save(update_fields=["active_project"])
        self.task = Task.objects.create(
            summary="Test Task",
            type="asset",
            project=self.project,
            owner=self.user,
        )
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        # Always clear cache between tests.
        cache.clear()


# ---------------------------------------------------------------------------
# 1. invalidate_task_ai_cache utility
# ---------------------------------------------------------------------------


class InvalidateCacheTest(_BaseTaskTest):
    """Unit tests for invalidate_task_ai_cache."""

    def test_invalidate_removes_existing_key(self):
        """invalidate_task_ai_cache deletes the cache entry for the task."""
        from task.ai_summary import invalidate_task_ai_cache

        key = f"{_CACHE_PREFIX}:{self.task.id}"
        cache.set(key, "some-gemini-cache-name", 300)
        self.assertEqual(cache.get(key), "some-gemini-cache-name")

        invalidate_task_ai_cache(self.task.id)

        self.assertIsNone(cache.get(key))

    def test_invalidate_is_idempotent_when_key_absent(self):
        """Calling invalidate when no key exists does not raise."""
        from task.ai_summary import invalidate_task_ai_cache

        # Should complete without error even if key is missing.
        invalidate_task_ai_cache(self.task.id)


# ---------------------------------------------------------------------------
# 2. ai_summary view  (POST /api/tasks/<id>/ai-summary/)
# ---------------------------------------------------------------------------


class AISummaryViewTest(_BaseTaskTest):
    """Tests for TaskViewSet.ai_summary action."""

    def _url(self, task_id=None):
        pk = task_id if task_id is not None else self.task.id
        return reverse("task-ai-summary", kwargs={"pk": pk})

    @patch("task.ai_summary.generate_ai_summary", return_value=_SUMMARY_FIXTURE)
    def test_returns_200_with_expected_keys(self, mock_gen):
        """Authenticated request returns 200 and all expected summary keys."""
        response = self.client.post(self._url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for key in (
            "key_decisions",
            "blockers",
            "escalations",
            "action_items",
            "status_changes",
            "unresolved_questions",
        ):
            self.assertIn(key, response.data)

    @patch("task.ai_summary.generate_ai_summary", return_value=_SUMMARY_FIXTURE)
    def test_returns_401_if_unauthenticated(self, _mock):
        """Unauthenticated request is rejected with 401."""
        self.client.force_authenticate(user=None)
        response = self.client.post(self._url())
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch("task.ai_summary.generate_ai_summary", return_value=_SUMMARY_FIXTURE)
    def test_returns_404_for_nonexistent_task(self, _mock):
        """Request for a non-existent task returns 404."""
        response = self.client.post(self._url(task_id=999999))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# 3. ai_qa view  (POST /api/tasks/<id>/ai-qa/)
# ---------------------------------------------------------------------------


class AIQAViewTest(_BaseTaskTest):
    """Tests for TaskViewSet.ai_qa action."""

    def _url(self, task_id=None):
        pk = task_id if task_id is not None else self.task.id
        return reverse("task-ai-qa", kwargs={"pk": pk})

    @patch("task.ai_summary.answer_task_question", return_value="The answer is 42.")
    def test_returns_200_with_answer(self, mock_answer):
        """Valid question returns 200 with an answer key."""
        response = self.client.post(
            self._url(), {"question": "What is the status?"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("answer", response.data)
        self.assertEqual(response.data["answer"], "The answer is 42.")

    def test_returns_400_if_question_missing(self):
        """POST without a question field returns 400."""
        response = self.client.post(self._url(), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_returns_400_if_question_blank(self):
        """POST with a blank question string returns 400."""
        response = self.client.post(
            self._url(), {"question": "   "}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("task.ai_summary.answer_task_question", return_value="ok")
    def test_returns_401_if_unauthenticated(self, _mock):
        """Unauthenticated request is rejected with 401."""
        self.client.force_authenticate(user=None)
        response = self.client.post(
            self._url(), {"question": "Hello?"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# 4. Cache invalidation on mutations
# ---------------------------------------------------------------------------


class CacheInvalidationOnMutationTest(_BaseTaskTest):
    """Verify that invalidate_task_ai_cache is called on task-mutating operations."""

    _PATCH_TARGET = "task.ai_summary.invalidate_task_ai_cache"

    def test_invalidated_on_comment_create(self):
        """Creating a comment invalidates the AI cache for that task."""
        url = reverse("task-comment-list", kwargs={"task_id": self.task.id})
        with patch(self._PATCH_TARGET) as mock_inv:
            response = self.client.post(url, {"body": "New comment"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mock_inv.assert_called_once_with(self.task.id)

    def test_invalidated_on_attachment_delete(self):
        """Deleting an attachment invalidates the AI cache for that task."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from task.models import TaskAttachment

        # Create a minimal in-memory attachment so there's a row to delete.
        fake_file = SimpleUploadedFile("test.txt", b"hello", content_type="text/plain")
        attachment = TaskAttachment.objects.create(
            task=self.task,
            file=fake_file,
            original_filename="test.txt",
            file_size=5,
            content_type="text/plain",
            uploaded_by=self.user,
        )

        url = reverse(
            "task-attachment-detail",
            kwargs={"task_id": self.task.id, "pk": attachment.id},
        )
        with patch(self._PATCH_TARGET) as mock_inv:
            response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        mock_inv.assert_called_once_with(self.task.id)

    def test_invalidated_on_submit(self):
        """Submitting a DRAFT task invalidates the AI cache."""
        url = reverse("task-submit", kwargs={"pk": self.task.id})
        with patch(self._PATCH_TARGET) as mock_inv:
            response = self.client.post(url)

        # submit_task returns 200 on success
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_inv.assert_called_once_with(self.task.id)


# ---------------------------------------------------------------------------
# 5. updated_at field in task serializer
# ---------------------------------------------------------------------------


class TaskUpdatedAtFieldTest(_BaseTaskTest):
    """The task detail endpoint must include updated_at as an ISO 8601 string."""

    def test_updated_at_present_in_task_detail(self):
        """GET /api/tasks/<id>/ response includes updated_at as an ISO string."""
        url = reverse("task-detail", kwargs={"pk": self.task.id})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("updated_at", response.data)
        # The value must be a non-empty string (ISO format from DRF)
        updated_at = response.data["updated_at"]
        self.assertIsInstance(updated_at, str)
        self.assertTrue(len(updated_at) > 0)
