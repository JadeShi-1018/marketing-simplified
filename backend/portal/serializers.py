from rest_framework import serializers
from django.contrib.auth import get_user_model
from customer.models import Customer
from csm.models import Conversation, ConversationMessage

User = get_user_model()


class PortalRegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    full_name = serializers.CharField(max_length=200)
    company = serializers.CharField(max_length=200, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=50, required=False, allow_blank=True)

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def create(self, validated_data):
        email = validated_data['email']
        password = validated_data['password']
        full_name = validated_data['full_name']
        company = validated_data.get('company', '')
        phone = validated_data.get('phone', '')

        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=full_name.split(' ')[0],
            last_name=' '.join(full_name.split(' ')[1:]) if ' ' in full_name else '',
        )

        customer = Customer.objects.create(
            user=user,
            email=email,
            full_name=full_name,
            company=company,
            phone=phone,
        )

        return user, customer


class PortalMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ConversationMessage
        fields = ['id', 'sender_type', 'sender_name', 'content', 'rich_body', 'image_url', 'created_at']
        read_only_fields = ['id', 'sender_type', 'sender_name', 'created_at']

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def get_sender_name(self, obj):
        if obj.sender_type == 'agent' and obj.sender_agent:
            full = obj.sender_agent.user.get_full_name()
            return full if full.strip() else obj.sender_agent.user.email
        if obj.sender_type == 'customer':
            conv = obj.conversation
            if conv.customer:
                return conv.customer.full_name
        return 'System'


class PortalConversationSerializer(serializers.ModelSerializer):
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    subject = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'status', 'status_display', 'channel',
            'subject', 'tags', 'started_at', 'created_at',
            'last_message', 'unread_count',
        ]

    def get_subject(self, obj):
        return obj.tags[0] if obj.tags else ''

    def get_last_message(self, obj):
        msg = obj.messages.order_by('-created_at').first()
        if not msg:
            return None
        return {'content': msg.content[:100], 'sender_type': msg.sender_type, 'created_at': msg.created_at}

    def get_unread_count(self, obj):
        # Messages from agents that the customer hasn't seen
        # Simple implementation: count agent messages since last customer message
        last_customer_msg = obj.messages.filter(sender_type='customer').order_by('-created_at').first()
        if not last_customer_msg:
            return obj.messages.filter(sender_type='agent').count()
        return obj.messages.filter(
            sender_type='agent',
            created_at__gt=last_customer_msg.created_at
        ).count()


class PortalConversationDetailSerializer(PortalConversationSerializer):
    messages = PortalMessageSerializer(many=True, read_only=True)

    class Meta(PortalConversationSerializer.Meta):
        fields = PortalConversationSerializer.Meta.fields + ['messages']
