import pytest
from django.urls import reverse
from rest_framework import status

from chat.models import Chat, ChatParticipant, ChatType


pytestmark = pytest.mark.django_db


class TestChatSlugApi:
    def test_retrieve_chat_by_slug(self, member_client, project, user, user2_in_project):
        chat = Chat.objects.create(project=project, type=ChatType.PRIVATE)
        ChatParticipant.objects.create(chat=chat, user=user, is_active=True)
        ChatParticipant.objects.create(chat=chat, user=user2_in_project, is_active=True)
        chat.refresh_from_db()

        url = reverse('chat-detail', kwargs={'slug': chat.slug})
        response = member_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == chat.id
        assert response.data['slug'] == chat.slug
        assert len(response.data['participants']) == 2

    def test_retrieve_chat_by_slug_numeric_id_404(self, member_client, project, user):
        chat = Chat.objects.create(project=project, type=ChatType.GROUP, name='Slug Channel')
        ChatParticipant.objects.create(chat=chat, user=user, is_active=True)

        url = reverse('chat-detail', kwargs={'slug': str(chat.id)})
        response = member_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_legacy_id_slug_endpoint(self, member_client, project, user, user2_in_project):
        chat = Chat.objects.create(project=project, type=ChatType.PRIVATE)
        ChatParticipant.objects.create(chat=chat, user=user, is_active=True)
        ChatParticipant.objects.create(chat=chat, user=user2_in_project, is_active=True)
        chat.refresh_from_db()

        url = reverse('chat-legacy-id-slug')
        response = member_client.get(url, {'id': chat.id})

        assert response.status_code == status.HTTP_200_OK
        assert response.data['slug'] == chat.slug


class TestChatChannelCreate:
    def test_create_solo_group_channel_without_other_participants(
        self, member_client, project, user,
    ):
        url = reverse('chat-list')
        response = member_client.post(
            url,
            {
                'project': project.id,
                'type': ChatType.GROUP,
                'name': 'solo-channel',
                'participant_ids': [],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'solo-channel'
        assert len(response.data['participants']) == 1
        assert response.data['participants'][0]['user']['id'] == user.id

    def test_create_group_channel_accepts_project_slug(
        self, member_client, project, user,
    ):
        url = reverse('chat-list')
        response = member_client.post(
            url,
            {
                'project': project.slug,
                'type': ChatType.GROUP,
                'name': 'slug-project-channel',
                'participant_ids': [],
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['project'] == project.id
        assert response.data['slug']
