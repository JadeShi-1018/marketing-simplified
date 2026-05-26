import os
from io import StringIO
from unittest.mock import patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
os.environ["DEBUG"] = "False"

import django
from django.apps import apps

if not apps.ready:
    django.setup()

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from comments.models import Comment, CommentAttachment, CommentMention
from comments.preview_generation import (
    PreviewGenerationError,
    generate_comment_attachment_preview,
)
from core.models import Organization, Project, ProjectMember
from task.models import Task

User = get_user_model()


def rich_text(text):
    """Build the minimal rich-text JSON document used by API tests."""

    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": text}],
            }
        ],
    }


def rich_text_with_media(text, attachment_id):
    """Build rich text with one inline media node bound by attachment id."""

    doc = rich_text(text)
    doc["content"][0]["content"].append(
        {
            "type": "commentMedia",
            "attrs": {
                "attachmentId": str(attachment_id),
                "src": "http://testserver/media/comments/attachments/brief.txt",
                "filename": "brief.txt",
                "contentType": "text/plain",
                "size": 13,
                "kind": "file",
                "status": "uploaded",
            },
        }
    )
    return doc


class CommentAPITest(APITestCase):
    """Security and consistency coverage for the reusable comments API."""

    def setUp(self):
        self.organization = Organization.objects.create(name="Comment Org")
        self.member = User.objects.create_user(
            username="member",
            email="member@example.com",
            password="testpass123",
            organization=self.organization,
        )
        self.author = User.objects.create_user(
            username="author",
            email="author@example.com",
            password="testpass123",
            organization=self.organization,
        )
        self.approver = User.objects.create_user(
            username="approver",
            email="approver@example.com",
            password="testpass123",
            organization=self.organization,
        )
        self.unrelated = User.objects.create_user(
            username="unrelated",
            email="unrelated@example.com",
            password="testpass123",
            organization=self.organization,
        )
        self.project = Project.objects.create(
            name="Comment Project",
            organization=self.organization,
            owner=self.author,
        )
        ProjectMember.objects.create(
            user=self.member,
            project=self.project,
            role="member",
            is_active=True,
        )
        ProjectMember.objects.create(
            user=self.author,
            project=self.project,
            role="member",
            is_active=True,
        )
        self.task = Task.objects.create(
            summary="Needs comments",
            type="asset",
            project=self.project,
            owner=self.author,
            current_approver=self.approver,
        )

    def comments_url(self):
        return reverse("comment-list")

    def detail_url(self, comment):
        return reverse("comment-detail", kwargs={"comment_id": comment.id})

    def upload_url(self):
        return reverse("comment-attachment-upload")

    def preview_url(self, attachment):
        return reverse("comment-attachment-preview", kwargs={"attachment_id": attachment.id})

    def attachment_detail_url(self, attachment):
        return reverse("comment-attachment-detail", kwargs={"attachment_id": attachment.id})

    def mention_users_url(self):
        return reverse("comment-mention-users")

    def create_comment(self, user=None, body_text="hello"):
        self.client.force_authenticate(user=user or self.author)
        response = self.client.post(
            self.comments_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "body": rich_text(body_text),
                "mentions": [],
                "attachment_ids": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return Comment.objects.get(id=response.data["id"])

    def upload_attachment(
        self,
        user=None,
        filename="brief.txt",
        content_type="text/plain",
        content=b"file contents",
    ):
        self.client.force_authenticate(user=user or self.author)
        upload = SimpleUploadedFile(
            filename,
            content,
            content_type=content_type,
        )
        response = self.client.post(
            self.upload_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "file": upload,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return response.data["id"]

    def create_bound_attachment(self, *, filename, content_type, user=None):
        owner = user or self.author
        attachment_id = self.upload_attachment(
            user=owner,
            filename=filename,
            content_type=content_type,
        )
        self.client.force_authenticate(user=owner)
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
        return CommentAttachment.objects.get(id=attachment_id)

    def test_active_project_member_can_list_task_comments(self):
        comment = self.create_comment()
        self.client.force_authenticate(user=self.member)

        response = self.client.get(
            self.comments_url(),
            {"entity_type": "task", "entity_id": self.task.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in response.data], [str(comment.id)])

    def test_list_returns_newest_comments_first(self):
        older_comment = self.create_comment(body_text="older")
        newer_comment = self.create_comment(body_text="newer")
        Comment.objects.filter(id=older_comment.id).update(
            created_at=timezone.now() - timezone.timedelta(minutes=5)
        )
        Comment.objects.filter(id=newer_comment.id).update(created_at=timezone.now())
        self.client.force_authenticate(user=self.member)

        response = self.client.get(
            self.comments_url(),
            {"entity_type": "task", "entity_id": self.task.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [row["id"] for row in response.data],
            [str(newer_comment.id), str(older_comment.id)],
        )

    def test_current_approver_can_list_task_comments(self):
        self.create_comment()
        self.client.force_authenticate(user=self.approver)

        response = self.client.get(
            self.comments_url(),
            {"entity_type": "task", "entity_id": self.task.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_unrelated_user_receives_403(self):
        self.create_comment()
        self.client.force_authenticate(user=self.unrelated)

        response = self.client.get(
            self.comments_url(),
            {"entity_type": "task", "entity_id": self.task.id},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_member_and_current_approver_can_create_comments(self):
        for user in [self.member, self.approver]:
            self.client.force_authenticate(user=user)
            response = self.client.post(
                self.comments_url(),
                {
                    "entity_type": "task",
                    "entity_id": str(self.task.id),
                    "body": rich_text(f"from {user.username}"),
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertEqual(response.data["author"]["id"], user.id)
            self.assertFalse(response.data["is_edited"])

    def test_author_can_update_own_comment(self):
        comment = self.create_comment(user=self.author)
        self.client.force_authenticate(user=self.author)

        response = self.client.patch(
            self.detail_url(comment),
            {"body": rich_text("edited"), "mentions": [self.member.id]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["body_text"], "edited")
        self.assertTrue(response.data["is_edited"])
        self.assertEqual([mention["id"] for mention in response.data["mentions"]], [self.member.id])

    def test_non_author_with_access_cannot_update_or_delete(self):
        comment = self.create_comment(user=self.author)
        self.client.force_authenticate(user=self.member)

        patch_response = self.client.patch(
            self.detail_url(comment),
            {"body": rich_text("not allowed")},
            format="json",
        )
        delete_response = self.client.delete(self.detail_url(comment))

        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_author_can_soft_delete_and_deleted_comment_disappears(self):
        comment = self.create_comment(user=self.author)
        self.client.force_authenticate(user=self.author)

        delete_response = self.client.delete(self.detail_url(comment))
        list_response = self.client.get(
            self.comments_url(),
            {"entity_type": "task", "entity_id": self.task.id},
        )
        detail_response = self.client.get(self.detail_url(comment))

        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data, [])
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Comment.objects.count(), 0)
        self.assertEqual(Comment.all_objects.deleted().count(), 1)

    def test_invalid_entity_type_returns_400_and_missing_target_returns_404(self):
        self.client.force_authenticate(user=self.author)

        invalid_response = self.client.get(
            self.comments_url(),
            {"entity_type": "unknown", "entity_id": self.task.id},
        )
        missing_response = self.client.get(
            self.comments_url(),
            {"entity_type": "task", "entity_id": 999999},
        )

        self.assertEqual(invalid_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(missing_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_mentions_require_base_access_to_target(self):
        self.client.force_authenticate(user=self.author)

        response = self.client.post(
            self.comments_url(),
            {
                "entity_type": "task",
                "entity_id": str(self.task.id),
                "body": rich_text("mention invalid"),
                "mentions": [self.unrelated.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Comment.objects.count(), 0)
        self.assertEqual(CommentMention.objects.count(), 0)

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

    def test_image_attachment_preview_metadata_is_ready(self):
        attachment = self.create_bound_attachment(
            filename="creative.png",
            content_type="image/png",
        )
        self.client.force_authenticate(user=self.member)

        response = self.client.get(self.preview_url(attachment))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["attachment_id"], str(attachment.id))
        self.assertEqual(response.data["status"], "ready")
        self.assertEqual(response.data["kind"], "image")
        self.assertEqual(response.data["content_type"], "image/png")
        self.assertEqual(response.data["filename"], "creative.png")
        self.assertEqual(response.data["size"], attachment.size)
        self.assertTrue(response.data["original_file_url"].endswith(attachment.file.url))
        self.assertEqual(
            response.data["preview_pages"],
            [{"page": 1, "image_url": response.data["original_file_url"]}],
        )
        self.assertEqual(response.data["error_message"], "")

    def test_pdf_attachment_preview_metadata_is_pending_until_pages_are_generated(self):
        attachment = self.create_bound_attachment(
            filename="deck.pdf",
            content_type="application/pdf",
        )
        self.client.force_authenticate(user=self.member)

        response = self.client.get(self.preview_url(attachment))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "pending")
        self.assertEqual(response.data["kind"], "pdf")
        self.assertTrue(response.data["original_file_url"].endswith(attachment.file.url))
        self.assertEqual(response.data["preview_pages"], [])

    def test_zip_attachment_preview_metadata_is_unsupported(self):
        attachment = self.create_bound_attachment(
            filename="archive.zip",
            content_type="application/zip",
        )
        self.client.force_authenticate(user=self.member)

        response = self.client.get(self.preview_url(attachment))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "unsupported")
        self.assertEqual(response.data["kind"], "zip")
        self.assertIsNone(response.data["original_file_url"])
        self.assertEqual(response.data["preview_pages"], [])

    def test_video_attachment_preview_metadata_is_unsupported(self):
        attachment = self.create_bound_attachment(
            filename="spot.mp4",
            content_type="video/mp4",
        )
        self.client.force_authenticate(user=self.member)

        response = self.client.get(self.preview_url(attachment))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "unsupported")
        self.assertEqual(response.data["kind"], "video")
        self.assertIsNone(response.data["original_file_url"])
        self.assertEqual(response.data["preview_pages"], [])

    def test_document_attachment_preview_metadata_can_be_pending_or_processing(self):
        attachment = self.create_bound_attachment(
            filename="brief.docx",
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        self.client.force_authenticate(user=self.member)

        pending_response = self.client.get(self.preview_url(attachment))
        attachment.preview_status = CommentAttachment.PREVIEW_PROCESSING
        attachment.save(update_fields=["preview_status"])
        processing_response = self.client.get(self.preview_url(attachment))

        self.assertEqual(pending_response.status_code, status.HTTP_200_OK)
        self.assertEqual(pending_response.data["kind"], "document")
        self.assertEqual(pending_response.data["status"], "pending")
        self.assertEqual(pending_response.data["preview_pages"], [])
        self.assertEqual(processing_response.status_code, status.HTTP_200_OK)
        self.assertEqual(processing_response.data["kind"], "document")
        self.assertEqual(processing_response.data["status"], "processing")

    def test_attachment_preview_requires_comment_target_access(self):
        attachment = self.create_bound_attachment(
            filename="creative.png",
            content_type="image/png",
        )
        self.client.force_authenticate(user=self.unrelated)

        response = self.client.get(self.preview_url(attachment))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_existing_ready_preview_pages_are_returned_by_preview_api(self):
        attachment = self.create_bound_attachment(
            filename="brief.docx",
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        attachment.preview_status = CommentAttachment.PREVIEW_READY
        attachment.preview_metadata = {
            "preview_pages": [
                {
                    "page": 1,
                    "image_url": "/media/comments/previews/example/page-001.webp",
                    "width": 1240,
                    "height": 1754,
                }
            ]
        }
        attachment.save(update_fields=["preview_status", "preview_metadata"])
        self.client.force_authenticate(user=self.member)

        response = self.client.get(self.preview_url(attachment))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ready")
        self.assertEqual(len(response.data["preview_pages"]), 1)
        self.assertEqual(response.data["preview_pages"][0]["page"], 1)
        self.assertTrue(
            response.data["preview_pages"][0]["image_url"].endswith(
                attachment.preview_metadata["preview_pages"][0]["image_url"]
            )
        )
        self.assertEqual(response.data["preview_pages"][0]["width"], 1240)
        self.assertEqual(response.data["preview_pages"][0]["height"], 1754)

    @patch("comments.preview_generation._generate_document_preview_pages")
    def test_preview_generation_stores_valid_page_metadata(self, mock_generate_pages):
        attachment = self.create_bound_attachment(
            filename="brief.docx",
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        mock_generate_pages.return_value = [
            {
                "page": 1,
                "image_url": "/media/comments/previews/example/page-001.webp",
                "width": 1240,
                "height": 1754,
            }
        ]

        generate_comment_attachment_preview(attachment)
        attachment.refresh_from_db()

        self.assertEqual(attachment.preview_status, CommentAttachment.PREVIEW_READY)
        self.assertEqual(
            attachment.preview_metadata,
            {"preview_pages": mock_generate_pages.return_value},
        )
        self.assertEqual(attachment.preview_error, "")

    @patch("comments.preview_generation._generate_document_preview_pages")
    def test_preview_generation_failure_sets_failed_status(self, mock_generate_pages):
        attachment = self.create_bound_attachment(
            filename="deck.pdf",
            content_type="application/pdf",
        )
        mock_generate_pages.side_effect = PreviewGenerationError("PDF renderer is unavailable.")

        generate_comment_attachment_preview(attachment)
        attachment.refresh_from_db()

        self.assertEqual(attachment.preview_status, CommentAttachment.PREVIEW_FAILED)
        self.assertEqual(attachment.preview_metadata, {"preview_pages": []})
        self.assertEqual(attachment.preview_error, "PDF renderer is unavailable.")

        self.client.force_authenticate(user=self.member)
        response = self.client.get(self.preview_url(attachment))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "failed")
        self.assertEqual(response.data["error_message"], "PDF renderer is unavailable.")

    @patch("comments.preview_generation._generate_document_preview_pages")
    def test_zip_and_video_generation_remain_unsupported(self, mock_generate_pages):
        zip_attachment = self.create_bound_attachment(
            filename="archive.zip",
            content_type="application/zip",
        )
        video_attachment = self.create_bound_attachment(
            filename="spot.mp4",
            content_type="video/mp4",
        )

        generate_comment_attachment_preview(zip_attachment)
        generate_comment_attachment_preview(video_attachment)
        zip_attachment.refresh_from_db()
        video_attachment.refresh_from_db()

        self.assertEqual(zip_attachment.preview_status, CommentAttachment.PREVIEW_UNSUPPORTED)
        self.assertEqual(video_attachment.preview_status, CommentAttachment.PREVIEW_UNSUPPORTED)
        self.assertEqual(zip_attachment.preview_metadata, {"preview_pages": []})
        self.assertEqual(video_attachment.preview_metadata, {"preview_pages": []})
        mock_generate_pages.assert_not_called()

    @patch(
        "comments.management.commands.generate_comment_attachment_preview."
        "generate_comment_attachment_preview"
    )
    def test_generate_preview_management_command_calls_service(self, mock_generate_preview):
        attachment = self.create_bound_attachment(
            filename="deck.pdf",
            content_type="application/pdf",
        )
        mock_generate_preview.return_value = attachment
        stdout = StringIO()

        call_command(
            "generate_comment_attachment_preview",
            str(attachment.id),
            stdout=stdout,
        )

        mock_generate_preview.assert_called_once()
        self.assertIn(str(attachment.id), stdout.getvalue())

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
        attachment_id = self.upload_attachment(user=self.unrelated)
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

    def test_mention_search_only_returns_users_with_base_access(self):
        self.client.force_authenticate(user=self.author)

        response = self.client.get(
            self.mention_users_url(),
            {"entity_type": "task", "entity_id": self.task.id, "q": "er"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {row["id"] for row in response.data}
        self.assertIn(self.member.id, returned_ids)
        self.assertIn(self.approver.id, returned_ids)
        self.assertNotIn(self.unrelated.id, returned_ids)
