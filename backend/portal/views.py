from rest_framework import status
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet
from rest_framework import mixins
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from customer.models import Customer
from csm.models import Conversation, ConversationMessage, Queue
from .serializers import (
    PortalRegisterSerializer,
    PortalConversationSerializer,
    PortalConversationDetailSerializer,
    PortalMessageSerializer,
)


class PortalRegisterView(APIView):
    """POST /api/portal/register/ — public customer registration."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PortalRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, customer = serializer.save()

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': {
                    'id': user.id,
                    'email': user.email,
                    'full_name': customer.full_name,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class PortalConversationViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    GenericViewSet,
):
    """
    Customer-facing conversation endpoints.

    GET  /api/portal/conversations/              — my conversations
    POST /api/portal/conversations/              — start a new conversation
    GET  /api/portal/conversations/{id}/         — detail with messages
    POST /api/portal/conversations/{id}/messages/ — send a reply
    """
    permission_classes = [IsAuthenticated]

    def _get_customer(self):
        try:
            return self.request.user.customer_profile
        except Customer.DoesNotExist:
            return None

    def get_queryset(self):
        customer = self._get_customer()
        if not customer:
            return Conversation.objects.none()
        return Conversation.objects.filter(customer=customer).order_by('-started_at')

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PortalConversationDetailSerializer
        return PortalConversationSerializer

    def create(self, request, *args, **kwargs):
        customer = self._get_customer()
        if not customer:
            return Response(
                {'detail': 'No customer profile found for this account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        subject = request.data.get('subject', '').strip()
        message_text = request.data.get('message', '').strip()

        if not message_text:
            return Response({'detail': 'message is required.'}, status=status.HTTP_400_BAD_REQUEST)

        queue = None
        if customer.organisation:
            queue = Queue.objects.filter(organisation=customer.organisation).first()

        conversation = Conversation.objects.create(
            customer=customer,
            queue=queue,
            status='pending',
            channel='web',
            tags=[subject] if subject else [],
        )

        ConversationMessage.objects.create(
            conversation=conversation,
            sender_type='customer',
            content=message_text,
        )

        # Notify all online agents about the new conversation via WebSocket
        channel_layer = get_channel_layer()
        from csm.serializers import ConversationSerializer
        async_to_sync(channel_layer.group_send)(
            'csm_new_conversations',
            {
                'type': 'new.conversation',
                'conversation': ConversationSerializer(conversation).data,
            },
        )

        return Response(
            PortalConversationDetailSerializer(conversation).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def messages(self, request, pk=None):
        """POST /api/portal/conversations/{id}/messages/ — customer sends a reply."""
        conversation = self.get_object()
        content = request.data.get('content', '').strip()
        image = request.FILES.get('image')
        if not content and not image:
            return Response({'detail': 'content or image is required.'}, status=status.HTTP_400_BAD_REQUEST)

        msg = ConversationMessage.objects.create(
            conversation=conversation,
            sender_type='customer',
            content=content,
            image=image,
        )

        portal_payload = PortalMessageSerializer(msg, context={'request': request}).data

        from csm.serializers import ConversationSerializer, ConversationMessageSerializer
        agent_payload = ConversationMessageSerializer(msg, context={'request': request}).data

        channel_layer = get_channel_layer()
        # Broadcast new message to agents watching this conversation thread
        async_to_sync(channel_layer.group_send)(
            f'csm_conversation_{conversation.id}',
            {'type': 'conversation.message', 'message': agent_payload},
        )
        # Broadcast conversation_updated so all agents' lists refresh (new message indicator)
        async_to_sync(channel_layer.group_send)(
            'csm_new_conversations',
            {'type': 'conversation.updated', 'conversation': ConversationSerializer(conversation).data},
        )

        return Response(portal_payload, status=status.HTTP_201_CREATED)
