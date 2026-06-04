import os
from io import BytesIO

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
os.environ["DEBUG"] = "False"

import django
from django.apps import apps

if not apps.ready:
    django.setup()

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from comments.models import Comment, CommentAttachment
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


def tiny_png_bytes(width=3, height=2, color=(67, 160, 71)):
    """Create a real PNG so preview tests exercise image metadata extraction."""

    buffer = BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, format="PNG")
    return buffer.getvalue()


class CommentTestBase(APITestCase):
    """Shared project/task fixture for comments API and preview tests."""

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

    def create_bound_attachment(
        self,
        *,
        filename,
        content_type,
        user=None,
        content=b"file contents",
    ):
        owner = user or self.author
        attachment_id = self.upload_attachment(
            user=owner,
            filename=filename,
            content_type=content_type,
            content=content,
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
