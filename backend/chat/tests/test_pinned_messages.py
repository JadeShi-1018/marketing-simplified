from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from chat.models import Chat, ChatParticipant, ChatType, Message, PinnedMessage
from core.models import Organization, Project


pytestmark = pytest.mark.django_db
User = get_user_model()


class TestPinnedMessagesAPI:
    @pytest.fixture(autouse=True)
    def _setup(self):
        self.manager = User.objects.create_user(
            email='pin-manager@example.com',
            username='pin-manager',
            password='testpass123',
        )
        self.member = User.objects.create_user(
            email='pin-member@example.com',
            username='pin-member',
            password='testpass123',
        )
        self.outsider = User.objects.create_user(
            email='pin-outsider@example.com',
            username='pin-outsider',
            password='testpass123',
        )
        self.organization = Organization.objects.create(name='Pinned Messages Organization')
        self.project = Project.objects.create(
            name='Pinned Messages Project',
            organization=self.organization,
        )
        self.chat = Chat.objects.create(
            project=self.project,
            type=ChatType.GROUP,
            name='Pinned Messages Channel',
            created_by=self.manager,
        )
        self.manager_participant = ChatParticipant.objects.create(
            chat=self.chat,
            user=self.manager,
            is_active=True,
            is_manager=True,
        )
        self.member_participant = ChatParticipant.objects.create(
            chat=self.chat,
            user=self.member,
            is_active=True,
        )
        self.message = Message.objects.create(
            chat=self.chat,
            sender=self.member,
            content='Important channel announcement',
        )
        self.second_message = Message.objects.create(
            chat=self.chat,
            sender=self.manager,
            content='A newer pinned announcement',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.manager)

    def pin_url(self, chat=None):
        chat = chat or self.chat
        return reverse('chat-pin-message', kwargs={'slug': chat.slug})

    def pins_url(self, chat=None):
        chat = chat or self.chat
        return reverse('chat-list-pins', kwargs={'slug': chat.slug})

    def unpin_url(self, message=None, chat=None):
        chat = chat or self.chat
        message = message or self.message
        return reverse(
            'chat-unpin-message',
            kwargs={'slug': chat.slug, 'message_id': message.id},
        )

    def test_manager_can_pin_message_idempotently(self):
        first = self.client.post(
            self.pin_url(),
            {'message_id': self.message.id},
            format='json',
        )

        assert first.status_code == status.HTTP_201_CREATED
        pin = PinnedMessage.objects.get(chat=self.chat, message=self.message)
        assert pin.pinned_by == self.manager
        assert first.data['message']['id'] == self.message.id
        assert first.data['pinned_by']['id'] == self.manager.id
        assert first.data['created_at']

        second = self.client.post(
            self.pin_url(),
            {'message_id': self.message.id},
            format='json',
        )

        assert second.status_code == status.HTTP_200_OK
        assert PinnedMessage.objects.filter(chat=self.chat, message=self.message).count() == 1

    def test_regular_member_cannot_pin_or_unpin(self):
        pin = PinnedMessage.objects.create(
            chat=self.chat,
            message=self.message,
            pinned_by=self.manager,
        )
        self.client.force_authenticate(user=self.member)

        pin_response = self.client.post(
            self.pin_url(),
            {'message_id': self.second_message.id},
            format='json',
        )
        unpin_response = self.client.delete(self.unpin_url())

        assert pin_response.status_code == status.HTTP_403_FORBIDDEN
        assert unpin_response.status_code == status.HTTP_403_FORBIDDEN
        assert PinnedMessage.objects.filter(pk=pin.pk).exists()
        assert not PinnedMessage.objects.filter(
            chat=self.chat,
            message=self.second_message,
        ).exists()

    def test_manager_can_unpin_message(self):
        PinnedMessage.objects.create(
            chat=self.chat,
            message=self.message,
            pinned_by=self.manager,
        )

        response = self.client.delete(self.unpin_url())

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not PinnedMessage.objects.filter(chat=self.chat, message=self.message).exists()

    def test_unpin_missing_pin_returns_not_found(self):
        response = self.client.delete(self.unpin_url())

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_active_member_can_list_pins_newest_first(self):
        older_pin = PinnedMessage.objects.create(
            chat=self.chat,
            message=self.message,
            pinned_by=self.manager,
        )
        newer_pin = PinnedMessage.objects.create(
            chat=self.chat,
            message=self.second_message,
            pinned_by=self.manager,
        )
        now = timezone.now()
        PinnedMessage.objects.filter(pk=older_pin.pk).update(created_at=now - timedelta(hours=1))
        PinnedMessage.objects.filter(pk=newer_pin.pk).update(created_at=now)
        self.client.force_authenticate(user=self.member)

        response = self.client.get(self.pins_url())

        assert response.status_code == status.HTTP_200_OK
        assert [row['message']['id'] for row in response.data] == [
            self.second_message.id,
            self.message.id,
        ]

    @pytest.mark.parametrize('message_id', [None, 'not-a-number', 0, -1])
    def test_pin_rejects_invalid_message_id(self, message_id):
        payload = {} if message_id is None else {'message_id': message_id}

        response = self.client.post(self.pin_url(), payload, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not PinnedMessage.objects.filter(chat=self.chat).exists()

    def test_cannot_pin_message_from_another_chat(self):
        other_chat = Chat.objects.create(
            project=self.project,
            type=ChatType.GROUP,
            name='Other Channel',
            created_by=self.manager,
        )
        ChatParticipant.objects.create(
            chat=other_chat,
            user=self.manager,
            is_active=True,
            is_manager=True,
        )
        other_message = Message.objects.create(
            chat=other_chat,
            sender=self.manager,
            content='Belongs elsewhere',
        )

        response = self.client.post(
            self.pin_url(),
            {'message_id': other_message.id},
            format='json',
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not PinnedMessage.objects.filter(message=other_message).exists()

    @pytest.mark.parametrize('flag', ['is_deleted', 'is_revoked'])
    def test_cannot_pin_deleted_or_revoked_message(self, flag):
        setattr(self.message, flag, True)
        self.message.save(update_fields=[flag, 'updated_at'])

        response = self.client.post(
            self.pin_url(),
            {'message_id': self.message.id},
            format='json',
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not PinnedMessage.objects.filter(message=self.message).exists()

    @pytest.mark.parametrize('flag', ['is_deleted', 'is_revoked'])
    def test_list_hides_deleted_or_revoked_pinned_message(self, flag):
        PinnedMessage.objects.create(
            chat=self.chat,
            message=self.message,
            pinned_by=self.manager,
        )
        setattr(self.message, flag, True)
        self.message.save(update_fields=[flag, 'updated_at'])

        response = self.client.get(self.pins_url())

        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_inactive_participant_and_outsider_cannot_access_pins(self):
        self.member_participant.is_active = False
        self.member_participant.save(update_fields=['is_active', 'updated_at'])

        for user in (self.member, self.outsider):
            self.client.force_authenticate(user=user)
            assert self.client.get(self.pins_url()).status_code == status.HTTP_404_NOT_FOUND
            assert self.client.post(
                self.pin_url(),
                {'message_id': self.message.id},
                format='json',
            ).status_code == status.HTTP_404_NOT_FOUND
            assert self.client.delete(self.unpin_url()).status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_user_cannot_access_pins(self):
        self.client.force_authenticate(user=None)

        assert self.client.get(self.pins_url()).status_code == status.HTTP_401_UNAUTHORIZED
        assert self.client.post(
            self.pin_url(),
            {'message_id': self.message.id},
            format='json',
        ).status_code == status.HTTP_401_UNAUTHORIZED
        assert self.client.delete(self.unpin_url()).status_code == status.HTTP_401_UNAUTHORIZED

    def test_legacy_fallback_manager_can_pin(self):
        legacy_chat = Chat.objects.create(
            project=self.project,
            type=ChatType.GROUP,
            name='Legacy Channel',
        )
        ChatParticipant.objects.create(
            chat=legacy_chat,
            user=self.member,
            is_active=True,
        )
        ChatParticipant.objects.create(
            chat=legacy_chat,
            user=self.manager,
            is_active=True,
        )
        legacy_message = Message.objects.create(
            chat=legacy_chat,
            sender=self.member,
            content='Legacy manager announcement',
        )
        self.client.force_authenticate(user=self.member)

        response = self.client.post(
            self.pin_url(chat=legacy_chat),
            {'message_id': legacy_message.id},
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert PinnedMessage.objects.filter(
            chat=legacy_chat,
            message=legacy_message,
            pinned_by=self.member,
        ).exists()

    def test_private_chat_participants_cannot_pin_or_unpin(self):
        private_chat = Chat.objects.create(
            project=self.project,
            type=ChatType.PRIVATE,
            created_by=self.manager,
        )
        ChatParticipant.objects.create(
            chat=private_chat,
            user=self.manager,
            is_active=True,
        )
        ChatParticipant.objects.create(
            chat=private_chat,
            user=self.member,
            is_active=True,
        )
        private_message = Message.objects.create(
            chat=private_chat,
            sender=self.manager,
            content='Private conversation message',
        )
        pin = PinnedMessage.objects.create(
            chat=private_chat,
            message=private_message,
            pinned_by=self.manager,
        )

        pin_response = self.client.post(
            self.pin_url(chat=private_chat),
            {'message_id': private_message.id},
            format='json',
        )
        unpin_response = self.client.delete(
            self.unpin_url(message=private_message, chat=private_chat),
        )

        assert pin_response.status_code == status.HTTP_403_FORBIDDEN
        assert unpin_response.status_code == status.HTTP_403_FORBIDDEN
        assert PinnedMessage.objects.filter(pk=pin.pk).exists()
