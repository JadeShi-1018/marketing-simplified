"""
Tests: ChatView surfaces QuotaError to the SSE stream instead of swallowing it
into the generic "An internal error occurred" message.
"""
import json
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from agent.models import AgentSession
from core.models import Organization, Project
from stripe_meta.exceptions import QuotaError

User = get_user_model()


def _quota_generator(code, message):
    """Generator that raises QuotaError on first iteration."""
    def gen(*args, **kwargs):
        raise QuotaError(code=code, message=message)
        yield  # makes this a generator function
    return gen


def _parse_sse(response) -> list[dict]:
    content = b''.join(response.streaming_content)
    chunks = []
    for line in content.decode().splitlines():
        if line.startswith('data: '):
            chunks.append(json.loads(line[6:]))
    return chunks


class ChatViewQuotaTest(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='Chat Quota Org')
        self.user = User.objects.create_user(
            email='chat-quota@test.com',
            username='chatquota',
            password='pw',
        )
        self.user.organization = self.org
        self.user.save()
        self.project = Project.objects.create(
            name='Chat Quota Project',
            organization=self.org,
            owner=self.user,
        )
        self.session = AgentSession.objects.create(
            user=self.user,
            project=self.project,
        )
        self.client.force_authenticate(user=self.user)

    @patch('agent.views.AgentOrchestrator')
    def test_token_quota_exceeded_surfaced_before_done(self, MockOrch):
        instance = MagicMock()
        instance.handle_message.side_effect = _quota_generator(
            'TOKEN_QUOTA_EXCEEDED',
            'Monthly quota exceeded.',
        )
        MockOrch.return_value = instance

        response = self.client.post(
            f'/api/agent/sessions/{self.session.id}/chat/',
            {'message': 'Create tasks'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        chunks = _parse_sse(response)
        quota_indices = [
            index
            for index, chunk in enumerate(chunks)
            if chunk.get('code') == 'TOKEN_QUOTA_EXCEEDED'
        ]
        self.assertTrue(
            quota_indices,
            f"Expected TOKEN_QUOTA_EXCEEDED chunk; got: {chunks}",
        )
        quota_index = quota_indices[0]
        self.assertEqual(chunks[quota_index + 1], {'type': 'done'})
        generic = [
            chunk
            for chunk in chunks
            if 'internal error' in str(chunk.get('content', '')).lower()
        ]
        self.assertFalse(generic, f"Got generic error instead of quota code: {chunks}")
