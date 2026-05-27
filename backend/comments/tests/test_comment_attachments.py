import uuid
from io import StringIO
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from comments.tests.factories import (
    CommentTestBase,
    rich_text,
    rich_text_with_media,
)
from comments.models import Comment, CommentAttachment


class CommentAttachmentAPITest(CommentTestBase):
    def test_attachment_upload_and_bind_by_uuid(self):
        attachment_id = self.upload_attachment(user=self.author)
        self.client.force_authenticate(user=self.author)

        response = self.client.post(
            self.comments_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "body": rich_text_with_media("with file", attachment_id),
                "attachment_ids": [attachment_id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("attachments", response.data)
        self.assertEqual(CommentAttachment.objects.get(id=attachment_id).comment_id, Comment.objects.get().id)

    def test_attachment_ids_must_match_inline_media_body(self):
        attachment_id = self.upload_attachment(user=self.author)
        self.client.force_authenticate(user=self.author)

        response = self.client.post(
            self.comments_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "body": rich_text("orphan file"),
                "attachment_ids": [attachment_id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Comment.objects.count(), 0)
        self.assertIsNone(CommentAttachment.objects.get(id=attachment_id).comment_id)

    def test_duplicate_attachment_ids_are_rejected(self):
        attachment_id = self.upload_attachment(user=self.author)
        self.client.force_authenticate(user=self.author)

        response = self.client.post(
            self.comments_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "body": rich_text_with_media("duplicate file", attachment_id),
                "attachment_ids": [attachment_id, attachment_id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Comment.objects.count(), 0)
        self.assertIsNone(CommentAttachment.objects.get(id=attachment_id).comment_id)

    def test_missing_attachment_id_is_rejected(self):
        missing_attachment_id = uuid.uuid4()
        self.client.force_authenticate(user=self.author)

        response = self.client.post(
            self.comments_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "body": rich_text_with_media("missing file", missing_attachment_id),
                "attachment_ids": [missing_attachment_id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Comment.objects.count(), 0)

    def test_attachment_bound_to_another_comment_is_rejected(self):
        attachment = self.create_bound_attachment(
            filename="brief.txt",
            content_type="text/plain",
        )
        self.client.force_authenticate(user=self.author)

        response = self.client.post(
            self.comments_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "body": rich_text_with_media("reuse file", attachment.id),
                "attachment_ids": [attachment.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Comment.objects.count(), 1)

    def test_owner_can_delete_unbound_attachment(self):
        attachment_id = self.upload_attachment(user=self.author)
        attachment = CommentAttachment.objects.get(id=attachment_id)
        self.client.force_authenticate(user=self.author)

        response = self.client.delete(self.attachment_detail_url(attachment))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CommentAttachment.objects.filter(id=attachment_id).exists())

    def test_bound_attachment_cannot_be_deleted_directly(self):
        attachment = self.create_bound_attachment(
            filename="brief.txt",
            content_type="text/plain",
        )
        self.client.force_authenticate(user=self.author)

        response = self.client.delete(self.attachment_detail_url(attachment))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(CommentAttachment.objects.filter(id=attachment.id).exists())

    def test_attachment_detail_missing_attachment_returns_404(self):
        self.client.force_authenticate(user=self.author)

        response = self.client.delete(
            reverse(
                "comment-attachment-detail",
                kwargs={"attachment_id": uuid.uuid4()},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("comments.views.generate_comment_attachment_preview_task.delay")
    def test_attachment_upload_succeeds_when_preview_enqueue_fails(self, mock_delay):
        mock_delay.side_effect = RuntimeError("broker unavailable")
        self.client.force_authenticate(user=self.author)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                self.upload_url(),
                {
                    "entity_type": "task",
                    "entity_id": str(self.task.id),
                    "file": SimpleUploadedFile(
                        "brief.txt",
                        b"file contents",
                        content_type="text/plain",
                    ),
                },
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(CommentAttachment.objects.filter(id=response.data["id"]).exists())

    def test_cleanup_orphan_attachment_command_deletes_old_unbound_uploads(self):
        attachment_id = self.upload_attachment(user=self.author)
        CommentAttachment.objects.filter(id=attachment_id).update(
            created_at=timezone.now() - timezone.timedelta(hours=25)
        )
        stdout = StringIO()

        call_command(
            "cleanup_orphan_comment_attachments",
            "--older-than-hours",
            "24",
            stdout=stdout,
        )

        self.assertFalse(CommentAttachment.objects.filter(id=attachment_id).exists())
        self.assertIn("Deleted 1 orphan comment attachment", stdout.getvalue())

    def test_unauthorized_attachment_binding_is_rejected(self):
        attachment_id = self.upload_attachment(user=self.member)
        self.client.force_authenticate(user=self.author)

        response = self.client.post(
            self.comments_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "body": rich_text_with_media("bad file", attachment_id),
                "attachment_ids": [attachment_id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Comment.objects.count(), 0)
        self.assertIsNone(CommentAttachment.objects.get(id=attachment_id).comment_id)

    def test_create_rolls_back_comment_and_attachment_when_mentions_fail(self):
        attachment_id = self.upload_attachment(user=self.author)
        self.client.force_authenticate(user=self.author)

        response = self.client.post(
            self.comments_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "body": rich_text_with_media("should rollback", attachment_id),
                "mentions": [self.unrelated.id],
                "attachment_ids": [attachment_id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Comment.objects.count(), 0)
        self.assertIsNone(CommentAttachment.objects.get(id=attachment_id).comment_id)
