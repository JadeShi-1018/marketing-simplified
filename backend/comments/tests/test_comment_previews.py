import uuid

from django.urls import reverse
from rest_framework import status

from comments.tests.factories import CommentTestBase
from comments.models import CommentAttachment


class CommentAttachmentPreviewAPITest(CommentTestBase):
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

    def test_attachment_preview_missing_attachment_returns_404(self):
        self.client.force_authenticate(user=self.author)

        response = self.client.get(
            reverse(
                "comment-attachment-preview",
                kwargs={"attachment_id": uuid.uuid4()},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
