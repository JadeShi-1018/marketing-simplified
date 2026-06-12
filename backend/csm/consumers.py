import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)


class CsmConversationConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time CSM conversation updates.

    Connection URL: ws://localhost:8000/ws/csm/agent/{user_id}/

    Message Types (client -> server):
    - typing_start: Agent started typing in a conversation
    - typing_stop: Agent stopped typing
    - join_conversation: Subscribe to a specific conversation's events
    - leave_conversation: Unsubscribe from a conversation

    Message Types (server -> client):
    - new_message: New message in a conversation
    - conversation_updated: Conversation metadata changed (status, queue, etc.)
    - typing_indicator: Someone is typing
    - error: Error message
    """

    async def connect(self):
        self.user_id = self.scope['url_route']['kwargs']['user_id']
        self.user = self.scope.get('user')
        self.joined_conversations = set()

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        if str(self.user.id) != str(self.user_id):
            await self.close(code=4003)
            return

        # Join personal agent group (for targeted notifications)
        self.agent_group = f'csm_agent_{self.user_id}'
        await self.channel_layer.group_add(self.agent_group, self.channel_name)

        # Join global new-conversation broadcast group
        await self.channel_layer.group_add('csm_new_conversations', self.channel_name)

        await self.accept()
        logger.info(f'[CSM WS] Agent {self.user_id} connected')

    async def disconnect(self, close_code):
        # Leave personal group (may not exist if connect() was rejected early)
        if hasattr(self, 'agent_group'):
            await self.channel_layer.group_discard(self.agent_group, self.channel_name)
            await self.channel_layer.group_discard('csm_new_conversations', self.channel_name)

        # Leave any joined conversation groups
        for conv_id in list(self.joined_conversations):
            await self.channel_layer.group_discard(
                f'csm_conversation_{conv_id}', self.channel_name
            )

        logger.info(f'[CSM WS] Agent {self.user_id} disconnected (code={close_code})')

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send_error('Invalid JSON')
            return

        msg_type = data.get('type')

        if msg_type == 'join_conversation':
            await self.handle_join_conversation(data)
        elif msg_type == 'leave_conversation':
            await self.handle_leave_conversation(data)
        elif msg_type == 'typing_start':
            await self.handle_typing(data, is_typing=True)
        elif msg_type == 'typing_stop':
            await self.handle_typing(data, is_typing=False)
        else:
            await self.send_error(f'Unknown message type: {msg_type}')

    async def handle_join_conversation(self, data):
        conv_id = data.get('conversation_id')
        if not conv_id:
            return
        if not await self.can_access_conversation(conv_id):
            await self.send_error('Access denied to this conversation')
            return
        group = f'csm_conversation_{conv_id}'
        await self.channel_layer.group_add(group, self.channel_name)
        self.joined_conversations.add(conv_id)
        await self.send(text_data=json.dumps({'type': 'joined', 'conversation_id': conv_id}))

    async def handle_leave_conversation(self, data):
        conv_id = data.get('conversation_id')
        if not conv_id:
            return
        group = f'csm_conversation_{conv_id}'
        await self.channel_layer.group_discard(group, self.channel_name)
        self.joined_conversations.discard(conv_id)

    async def handle_typing(self, data, is_typing: bool):
        conv_id = data.get('conversation_id')
        if not conv_id or conv_id not in self.joined_conversations:
            return
        await self.channel_layer.group_send(
            f'csm_conversation_{conv_id}',
            {
                'type': 'typing.indicator',
                'conversation_id': conv_id,
                'user_id': self.user_id,
                'is_typing': is_typing,
            },
        )

    # ── Channel layer event handlers (server -> client) ──────────────────────

    async def conversation_message(self, event):
        """Broadcast a new message to all subscribers of the conversation."""
        await self.send(text_data=json.dumps({
            'type': 'new_message',
            'message': event['message'],
        }))

    async def conversation_updated(self, event):
        """Broadcast conversation metadata updates (status, queue, assigned_to, tags)."""
        await self.send(text_data=json.dumps({
            'type': 'conversation_updated',
            'conversation': event['conversation'],
        }))

    async def new_conversation(self, event):
        """Broadcast to agents when a customer creates a new conversation."""
        await self.send(text_data=json.dumps({
            'type': 'new_conversation',
            'conversation': event['conversation'],
        }))

    async def typing_indicator(self, event):
        # Don't send typing indicator back to the person who triggered it
        if str(event['user_id']) == str(self.user_id):
            return
        await self.send(text_data=json.dumps({
            'type': 'typing_indicator',
            'conversation_id': event['conversation_id'],
            'user_id': event['user_id'],
            'is_typing': event['is_typing'],
        }))

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def send_error(self, detail: str):
        await self.send(text_data=json.dumps({'type': 'error', 'detail': detail}))

    @database_sync_to_async
    def can_access_conversation(self, conversation_id: int) -> bool:
        from .models import Conversation, CustomerUser, QueueAgent
        try:
            conv = Conversation.objects.select_related('queue').get(id=conversation_id)
        except Conversation.DoesNotExist:
            return False

        cu = CustomerUser.objects.filter(user=self.user, is_active=True).first()
        if cu and cu.user_type in ('supervisor', 'admin'):
            return True

        # Unassigned conversation (queue=None) — any active agent can access
        if conv.queue is None:
            return cu is not None

        return QueueAgent.objects.filter(user=self.user, queue=conv.queue).exists()
