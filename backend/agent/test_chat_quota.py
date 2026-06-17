"""
Tests: ChatView surfaces QuotaError to the SSE stream instead of swallowing it
into the generic "An internal error occurred" message.
"""
import json
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from agent.models import AgentSession
from core.models import Organization, Project
from stripe_meta.exceptions import QuotaError
from stripe_meta.models import Plan, Subscription, UsageMonthly

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


class ChatViewPreflightQuotaTest(APITestCase):
    """Pre-flight gate: a plain chat message (no pipeline action) from a Free org
    that is at its monthly cap must be hard-blocked with 402 *before* the
    orchestrator runs — covering chitchat that never reaches call_llm. Action
    requests stay exempt (covered by the in-stream handler instead)."""

    def setUp(self):
        Subscription.objects.all().delete()
        Plan.objects.all().delete()
        # Create the org BEFORE the Free plan so the auto-subscription signal is a
        # no-op; we attach a deterministic Free sentinel subscription below.
        self.org = Organization.objects.create(name='Preflight Org')
        self.user = User.objects.create_user(
            email='preflight@test.com',
            username='preflightuser',
            password='pw',
        )
        self.user.organization = self.org
        self.user.save()
        self.project = Project.objects.create(
            name='Preflight Project',
            organization=self.org,
            owner=self.user,
        )
        self.session = AgentSession.objects.create(
            user=self.user,
            project=self.project,
        )
        self.free_plan = Plan.objects.create(
            name='Free',
            base_price_cents=0,
            included_seats=1,
            monthly_token_quota=500_000,
            overage_price_cents_per_1m=None,   # Free has no overage → hard block
        )
        Subscription.objects.filter(organization=self.org).delete()
        now = timezone.now()
        Subscription.objects.create(
            organization=self.org,
            plan=self.free_plan,
            stripe_subscription_id='free-sentinel',
            start_date=now,
            end_date=now + timedelta(days=30),
            is_active=True,
            is_internal=True,   # Free sentinel
        )
        UsageMonthly.objects.create(
            organization=self.org,
            year_month=now.strftime('%Y-%m'),
            tokens_used=500_000,   # at the cap
            tokens_reserved=0,
        )
        self.client.force_authenticate(user=self.user)

    def _chat(self, payload):
        return self.client.post(
            f'/api/agent/sessions/{self.session.id}/chat/',
            payload,
            format='json',
        )

    @patch('agent.views.AgentOrchestrator')
    def test_plain_message_at_cap_returns_402_without_running_orchestrator(self, MockOrch):
        response = self._chat({'message': 'hello'})

        self.assertEqual(response.status_code, 402)
        self.assertEqual(response.data['code'], 'TOKEN_QUOTA_EXCEEDED')
        MockOrch.return_value.handle_message.assert_not_called()

    @patch('agent.views.AgentOrchestrator')
    def test_action_request_at_cap_bypasses_preflight(self, MockOrch):
        def _done_generator(*args, **kwargs):
            yield {'type': 'done'}

        instance = MagicMock()
        instance.handle_message.side_effect = _done_generator
        MockOrch.return_value = instance

        response = self._chat({'message': 'create_tasks', 'action': 'create_tasks'})
        list(response.streaming_content)  # drain the SSE stream

        self.assertEqual(response.status_code, 200)
        instance.handle_message.assert_called_once()
