from unittest.mock import patch
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase

from core.models import Organization, Project, ProjectMember
from chat.models import Chat, ChatParticipant, ChatType
from chat.serializers import ChatCreateSerializer
from chat.services import ChatService, OnlineStatusService

User = get_user_model()


class OnlineStatusServiceTest(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username='presenceuser',
            email='presence@example.com',
            password='testpass123',
        )

    def tearDown(self):
        cache.clear()

    def test_multiple_connections_keep_user_online_until_last_disconnect(self):
        count, should_broadcast, version = OnlineStatusService.connection_opened(self.user.id, 'conn-1')
        self.assertEqual(count, 1)
        self.assertTrue(should_broadcast)
        self.assertIsInstance(version, int)
        self.assertTrue(OnlineStatusService.is_online(self.user.id))

        self.assertEqual(OnlineStatusService.connection_opened(self.user.id, 'conn-2'), (2, False, None))
        self.assertTrue(OnlineStatusService.is_online(self.user.id))

        self.assertEqual(OnlineStatusService.connection_closed(self.user.id, 'conn-1'), (1, None))
        self.assertTrue(OnlineStatusService.is_online(self.user.id))

        remaining, offline_token = OnlineStatusService.connection_closed(self.user.id, 'conn-2')
        self.assertEqual(remaining, 0)
        self.assertIsNotNone(offline_token)
        self.assertTrue(OnlineStatusService.is_online(self.user.id))

        offline_version = OnlineStatusService.finalize_offline_if_still_disconnected(self.user.id, offline_token)
        self.assertIsInstance(offline_version, int)
        self.assertFalse(OnlineStatusService.is_online(self.user.id))

    def test_heartbeat_refreshes_presence_without_incrementing_connections(self):
        count, should_broadcast, version = OnlineStatusService.connection_opened(self.user.id, 'conn-1')
        self.assertEqual(count, 1)
        self.assertTrue(should_broadcast)
        self.assertIsInstance(version, int)

        OnlineStatusService.heartbeat(self.user.id, 'conn-1')

        remaining, offline_token = OnlineStatusService.connection_closed(self.user.id, 'conn-1')
        self.assertEqual(remaining, 0)
        self.assertIsNotNone(offline_token)
        self.assertIsInstance(OnlineStatusService.finalize_offline_if_still_disconnected(self.user.id, offline_token), int)
        self.assertFalse(OnlineStatusService.is_online(self.user.id))

    def test_pending_offline_is_canceled_by_reconnect(self):
        OnlineStatusService.connection_opened(self.user.id, 'old-conn')
        remaining, offline_token = OnlineStatusService.connection_closed(self.user.id, 'old-conn')
        self.assertEqual(remaining, 0)
        self.assertIsNotNone(offline_token)

        count, should_broadcast, version = OnlineStatusService.connection_opened(self.user.id, 'new-conn')
        self.assertEqual(count, 1)
        self.assertTrue(should_broadcast)
        self.assertIsInstance(version, int)

        self.assertIsNone(OnlineStatusService.finalize_offline_if_still_disconnected(self.user.id, offline_token))
        self.assertTrue(OnlineStatusService.is_online(self.user.id))

    def test_presence_version_uses_timestamp_seed_after_existing_small_counter(self):
        key = OnlineStatusService._presence_version_key(self.user.id)
        cache.set(key, 5, timeout=OnlineStatusService.PRESENCE_VERSION_TIMEOUT)

        version = OnlineStatusService.next_presence_version(self.user.id)

        self.assertIsInstance(version, int)
        self.assertGreater(version, 1_000_000_000_000)

    def test_missing_presence_version_skips_online_broadcast(self):
        with patch.object(OnlineStatusService, 'next_presence_version', return_value=None):
            count, should_broadcast, version = OnlineStatusService.connection_opened(self.user.id, 'conn-1')

        self.assertEqual(count, 1)
        self.assertFalse(should_broadcast)
        self.assertIsNone(version)

    def test_suppressed_online_broadcast_is_logged_for_monitoring(self):
        with patch.object(OnlineStatusService, 'next_presence_version', return_value=None):
            with self.assertLogs('chat.services', level='WARNING') as captured:
                OnlineStatusService.connection_opened(self.user.id, 'conn-1')

        self.assertTrue(
            any('presence_broadcast_skipped reason=no_version' in line for line in captured.output),
            captured.output,
        )

    def test_invalidate_presence_recipients_clears_cached_lists(self):
        key = OnlineStatusService._presence_recipients_key(self.user.id)
        cache.set(key, [1, 2, 3], timeout=OnlineStatusService.PRESENCE_RECIPIENTS_TIMEOUT)

        OnlineStatusService.invalidate_presence_recipients([self.user.id])

        self.assertIsNone(cache.get(key))

    def test_reconnect_during_finalize_keeps_user_online(self):
        OnlineStatusService.connection_opened(self.user.id, 'old-conn')
        remaining, offline_token = OnlineStatusService.connection_closed(self.user.id, 'old-conn')
        self.assertEqual(remaining, 0)
        self.assertIsNotNone(offline_token)

        with patch.object(OnlineStatusService, '_connection_count', side_effect=[0, 1]):
            self.assertIsNone(
                OnlineStatusService.finalize_offline_if_still_disconnected(self.user.id, offline_token)
            )

        self.assertTrue(OnlineStatusService.is_online(self.user.id))

    def test_connection_count_failure_does_not_finalize_offline(self):
        OnlineStatusService.connection_opened(self.user.id, 'old-conn')
        remaining, offline_token = OnlineStatusService.connection_closed(self.user.id, 'old-conn')
        self.assertEqual(remaining, 0)
        self.assertIsNotNone(offline_token)

        with patch.object(OnlineStatusService, '_connection_count', return_value=None):
            self.assertIsNone(
                OnlineStatusService.finalize_offline_if_still_disconnected(self.user.id, offline_token)
            )

        self.assertTrue(OnlineStatusService.is_online(self.user.id))

    def test_redis_add_connection_failure_degrades_presence_without_blocking_connect(self):
        with patch.object(OnlineStatusService, '_add_connection', side_effect=ConnectionError('redis down')):
            count, should_broadcast, version = OnlineStatusService.connection_opened(self.user.id, 'conn-1')

        self.assertEqual(count, 1)
        self.assertFalse(should_broadcast)
        self.assertIsNone(version)

    def test_redis_remove_connection_failure_degrades_presence_without_crashing_disconnect(self):
        with patch.object(OnlineStatusService, '_remove_connection', side_effect=ConnectionError('redis down')):
            remaining, offline_token = OnlineStatusService.connection_closed(self.user.id, 'conn-1')

        self.assertEqual(remaining, 0)
        self.assertIsNone(offline_token)


class PresenceRecipientCacheInvalidationTest(TestCase):
    def setUp(self):
        cache.clear()
        self.org = Organization.objects.create(name='Acme')
        self.project = Project.objects.create(organization=self.org, name='Project')
        self.user_a = User.objects.create_user(username='a', email='a@example.com', password='x')
        self.user_b = User.objects.create_user(username='b', email='b@example.com', password='x')
        for user in (self.user_a, self.user_b):
            ProjectMember.objects.create(user=user, project=self.project, role='Member', is_active=True)
        self.chat = Chat.objects.create(project=self.project, type=ChatType.GROUP)
        ChatParticipant.objects.create(chat=self.chat, user=self.user_a, is_active=True)
        ChatParticipant.objects.create(chat=self.chat, user=self.user_b, is_active=True)

    def tearDown(self):
        cache.clear()

    def test_get_presence_recipient_ids_caches_result(self):
        recipients = ChatService.get_presence_recipient_ids(self.user_a.id)

        self.assertEqual(recipients, [self.user_b.id])
        cached = cache.get(OnlineStatusService._presence_recipients_key(self.user_a.id))
        self.assertEqual(cached, [self.user_b.id])

    def test_leaving_chat_invalidates_cached_recipient_lists(self):
        # Prime the cache for both users so we can prove invalidation, not just a cold miss.
        self.assertEqual(ChatService.get_presence_recipient_ids(self.user_a.id), [self.user_b.id])
        self.assertEqual(ChatService.get_presence_recipient_ids(self.user_b.id), [self.user_a.id])

        with self.captureOnCommitCallbacks(execute=True):
            ChatService.leave_chat(self.chat, self.user_b)

        # Both the remaining participant's and the leaver's cached lists are dropped.
        self.assertIsNone(cache.get(OnlineStatusService._presence_recipients_key(self.user_a.id)))
        self.assertIsNone(cache.get(OnlineStatusService._presence_recipients_key(self.user_b.id)))

        # Recomputed lists reflect the new membership.
        self.assertEqual(ChatService.get_presence_recipient_ids(self.user_a.id), [])

    def test_adding_participant_invalidates_existing_members_cache(self):
        user_c = User.objects.create_user(username='c', email='c@example.com', password='x')
        ProjectMember.objects.create(user=user_c, project=self.project, role='Member', is_active=True)

        self.assertEqual(ChatService.get_presence_recipient_ids(self.user_a.id), [self.user_b.id])

        with self.captureOnCommitCallbacks(execute=True):
            ChatService.add_participant(self.chat, user_c, added_by=self.user_a)

        self.assertIsNone(cache.get(OnlineStatusService._presence_recipients_key(self.user_a.id)))
        self.assertCountEqual(
            ChatService.get_presence_recipient_ids(self.user_a.id),
            [self.user_b.id, user_c.id],
        )

    def test_serializer_chat_create_invalidates_presence_cache(self):
        user_c = User.objects.create_user(username='serializer-c', email='serializer-c@example.com', password='x')
        ProjectMember.objects.create(user=user_c, project=self.project, role='Member', is_active=True)
        self.assertEqual(ChatService.get_presence_recipient_ids(self.user_a.id), [self.user_b.id])

        serializer = ChatCreateSerializer(
            data={
                'project': self.project.id,
                'type': ChatType.GROUP,
                'name': 'serializer channel',
                'participant_ids': [user_c.id],
            },
            context={'request': SimpleNamespace(user=self.user_a)},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        with self.captureOnCommitCallbacks(execute=True):
            serializer.save()

        self.assertIsNone(cache.get(OnlineStatusService._presence_recipients_key(self.user_a.id)))
        self.assertCountEqual(
            ChatService.get_presence_recipient_ids(self.user_a.id),
            [self.user_b.id, user_c.id],
        )

    def test_agent_private_chat_create_invalidates_presence_cache(self):
        from agent.services import _get_or_create_bot_private_chat

        bot = User.objects.create_user(
            username=f'agent-bot-{self.user_a.id}',
            email=f'agent-bot-{self.user_a.id}@example.com',
            password='x',
        )
        cache.set(OnlineStatusService._presence_recipients_key(bot.id), [self.user_b.id])
        cache.set(OnlineStatusService._presence_recipients_key(self.user_a.id), [self.user_b.id])

        with self.captureOnCommitCallbacks(execute=True):
            chat, created = _get_or_create_bot_private_chat(bot, self.user_a, self.project)

        self.assertTrue(created)
        self.assertEqual(chat.type, ChatType.PRIVATE)
        self.assertIsNone(cache.get(OnlineStatusService._presence_recipients_key(bot.id)))
        self.assertIsNone(cache.get(OnlineStatusService._presence_recipients_key(self.user_a.id)))

    def test_agent_private_chat_reactivation_invalidates_presence_cache(self):
        from agent.services import _get_or_create_bot_private_chat

        bot = User.objects.create_user(
            username=f'inactive-agent-bot-{self.user_a.id}',
            email=f'inactive-agent-bot-{self.user_a.id}@example.com',
            password='x',
        )
        chat = Chat.objects.create(project=self.project, type=ChatType.PRIVATE)
        ChatParticipant.objects.create(chat=chat, user=bot, is_active=False)
        ChatParticipant.objects.create(chat=chat, user=self.user_a, is_active=False)
        cache.set(OnlineStatusService._presence_recipients_key(bot.id), [self.user_b.id])
        cache.set(OnlineStatusService._presence_recipients_key(self.user_a.id), [self.user_b.id])

        with self.captureOnCommitCallbacks(execute=True):
            returned_chat, created = _get_or_create_bot_private_chat(bot, self.user_a, self.project)

        self.assertFalse(created)
        self.assertEqual(returned_chat.id, chat.id)
        self.assertTrue(ChatParticipant.objects.get(chat=chat, user=bot).is_active)
        self.assertTrue(ChatParticipant.objects.get(chat=chat, user=self.user_a).is_active)
        self.assertIsNone(cache.get(OnlineStatusService._presence_recipients_key(bot.id)))
        self.assertIsNone(cache.get(OnlineStatusService._presence_recipients_key(self.user_a.id)))

    def test_large_chat_skips_explicit_invalidation_and_relies_on_ttl(self):
        # Prime the cache, then make a membership change while the chat is "too big".
        self.assertEqual(ChatService.get_presence_recipient_ids(self.user_a.id), [self.user_b.id])

        with patch.object(OnlineStatusService, 'PRESENCE_RECIPIENTS_INVALIDATION_LIMIT', 1):
            with self.captureOnCommitCallbacks(execute=True):
                ChatService.leave_chat(self.chat, self.user_b)

        # Fan-out skipped: the cached list is left for the TTL to reconcile.
        self.assertEqual(
            cache.get(OnlineStatusService._presence_recipients_key(self.user_a.id)),
            [self.user_b.id],
        )
