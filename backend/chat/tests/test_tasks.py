"""Tests for chat Celery tasks."""

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from core.models import Organization, Project
from chat.models import (
    Chat,
    ChatParticipant,
    ChatType,
    Message,
    MessageAttachment,
    MessageStatus,
)
from chat.tasks import (
    ORPHAN_ATTACHMENT_TTL_HOURS,
    cleanup_orphaned_attachments,
    deliver_message_task,
    notify_new_message,
)

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


@pytest.fixture
def message_with_recipients(user):
    organization = Organization.objects.create(name='Fanout Org')
    project = Project.objects.create(name='Fanout Project', organization=organization)
    chat = Chat.objects.create(project=project, type=ChatType.GROUP)
    online_user = User.objects.create_user(
        email='online@example.com', username='online', password='pass12345'
    )
    offline_user = User.objects.create_user(
        email='offline@example.com', username='offline', password='pass12345'
    )
    for participant in (user, online_user, offline_user):
        ChatParticipant.objects.create(chat=chat, user=participant, is_active=True)
    message = Message.objects.create(chat=chat, sender=user, content='fanout test')
    MessageStatus.objects.bulk_create([
        MessageStatus(message=message, user=online_user, status='sent'),
        MessageStatus(message=message, user=offline_user, status='sent'),
    ])
    return message, online_user, offline_user


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


def test_notify_new_message_batches_presence_and_delivery_status(message_with_recipients):
    message, online_user, offline_user = message_with_recipients

    with (
        patch(
            'chat.tasks.OnlineStatusService.get_online_users',
            return_value=[online_user.id],
        ) as get_online_users,
        patch(
            'chat.tasks.broadcast_event_to_user_groups_sync',
            return_value=([online_user.id], {}),
        ) as broadcast,
        patch('chat.tasks.deliver_message_task.apply_async') as schedule_delivery,
    ):
        notify_new_message(message.id)

    recipient_ids = get_online_users.call_args.args[0]
    assert set(recipient_ids) == {online_user.id, offline_user.id}
    broadcast.assert_called_once()
    assert broadcast.call_args.args[1] == [online_user.id]
    schedule_delivery.assert_called_once_with(args=[message.id], countdown=5)

    online_status = MessageStatus.objects.get(message=message, user=online_user)
    offline_status = MessageStatus.objects.get(message=message, user=offline_user)
    assert online_status.status == 'delivered'
    assert online_status.delivered_at is not None
    assert offline_status.status == 'sent'
    assert offline_status.delivered_at is None


def test_deliver_message_task_does_not_retry_users_who_remain_offline(
    message_with_recipients,
):
    message, online_user, offline_user = message_with_recipients

    with (
        patch(
            'chat.tasks.OnlineStatusService.get_online_users',
            return_value=[],
        ) as get_online_users,
        patch('chat.tasks.broadcast_event_to_user_groups_sync') as broadcast,
    ):
        deliver_message_task(message.id)

    assert set(get_online_users.call_args.args[0]) == {
        online_user.id,
        offline_user.id,
    }
    broadcast.assert_not_called()
    assert MessageStatus.objects.filter(message=message, status='sent').count() == 2


def test_chat_tasks_are_routed_to_dedicated_queues():
    expected_routes = {
        'chat.tasks.notify_new_message': 'chat.realtime',
        'chat.tasks.notify_reaction_update': 'chat.realtime',
        'chat.tasks.notify_pin_update': 'chat.realtime',
        'chat.tasks.finalize_presence_offline': 'chat.realtime',
        'chat.tasks.send_typing_indicator': 'chat.realtime',
        'chat.tasks.update_message_status_task': 'chat.realtime',
        'chat.tasks.notify_message_recipients': 'chat.notifications',
        'chat.tasks.deliver_message_task': 'chat.delivery',
        'chat.tasks.send_scheduled_message': 'chat.delivery',
    }

    assert {
        task_name: settings.CELERY_TASK_ROUTES[task_name]['queue']
        for task_name in expected_routes
    } == expected_routes
