"""Tests for chat Celery tasks."""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from core.models import Organization, Project
from chat.models import Chat, ChatParticipant, ChatType, Message, MessageAttachment
from chat.tasks import ORPHAN_ATTACHMENT_TTL_HOURS, cleanup_orphaned_attachments

pytestmark = pytest.mark.django_db

User = get_user_model()


def _make_attachment(uploader, message=None, name='f.txt'):
    return MessageAttachment.objects.create(
        message=message,
        uploader=uploader,
        file=SimpleUploadedFile(name, b'data'),
        file_type='document',
        file_size=4,
        original_filename=name,
        mime_type='text/plain',
    )


def _backdate(attachment, hours):
    # created_at uses auto_now_add, so it can only be moved via a raw UPDATE.
    old = timezone.now() - timedelta(hours=hours)
    MessageAttachment.objects.filter(pk=attachment.pk).update(created_at=old)


@pytest.fixture
def user():
    return User.objects.create_user(
        email='u1@example.com', username='u1', password='pass12345'
    )


def test_sweeps_old_orphan(user):
    """An unlinked attachment older than the TTL is deleted."""
    orphan = _make_attachment(user)
    _backdate(orphan, ORPHAN_ATTACHMENT_TTL_HOURS + 1)

    deleted = cleanup_orphaned_attachments()

    assert deleted == 1
    assert not MessageAttachment.objects.filter(pk=orphan.pk).exists()


def test_keeps_recent_orphan(user):
    """A freshly uploaded orphan (still within the TTL) is left alone.

    This is the case that protects an attachment whose message is still waiting
    in the client outbox and has not been sent yet.
    """
    fresh = _make_attachment(user)  # created_at = now

    deleted = cleanup_orphaned_attachments()

    assert deleted == 0
    assert MessageAttachment.objects.filter(pk=fresh.pk).exists()


def test_never_touches_linked_attachment(user):
    """An attachment linked to a message is never swept, however old it is."""
    organization = Organization.objects.create(name='Test Org')
    project = Project.objects.create(name='Test Project', organization=organization)
    chat = Chat.objects.create(project=project, type=ChatType.PRIVATE)
    ChatParticipant.objects.create(chat=chat, user=user, is_active=True)
    message = Message.objects.create(chat=chat, sender=user, content='hello')
    linked = _make_attachment(user, message=message)
    _backdate(linked, ORPHAN_ATTACHMENT_TTL_HOURS + 100)  # old, but linked

    deleted = cleanup_orphaned_attachments()

    assert deleted == 0
    assert MessageAttachment.objects.filter(pk=linked.pk).exists()
