from rest_framework import serializers
from .models import Queue, QueueAgent, QueueTeam, CustomerUser, CsmNotification


class QueueSerializer(serializers.ModelSerializer):
    tier_display = serializers.CharField(source='get_tier_display', read_only=True)
    organisation_name = serializers.CharField(
        source='organisation.name', read_only=True, default=None,
    )

    class Meta:
        model = Queue
        fields = [
            'id', 'project', 'organisation', 'organisation_name',
            'name', 'description',
            'tier', 'tier_display',
            'display_order', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class QueueAgentSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model = QueueAgent
        fields = [
            'id', 'queue', 'user', 'user_email', 'user_name',
            'assigned_by', 'created_at',
        ]
        read_only_fields = ['id', 'assigned_by', 'created_at']


class QueueTeamSerializer(serializers.ModelSerializer):
    team_name = serializers.CharField(source='team.name', read_only=True)

    class Meta:
        model = QueueTeam
        fields = ['id', 'queue', 'team', 'team_name', 'created_at']
        read_only_fields = ['id', 'created_at']


class CustomerUserSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(write_only=True, required=False)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_name = serializers.SerializerMethodField()
    team_name = serializers.CharField(source='team.name', read_only=True, default=None)
    queue_name = serializers.CharField(source='queue.name', read_only=True, default=None)
    organisation_name = serializers.CharField(source='organisation.name', read_only=True, default=None)
    user_type_display = serializers.CharField(source='get_user_type_display', read_only=True)

    class Meta:
        model = CustomerUser
        fields = [
            'id', 'user', 'email', 'user_email', 'user_name',
            'team', 'team_name',
            'queue', 'queue_name',
            'organisation', 'organisation_name',
            'user_type', 'user_type_display',
            'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'user', 'created_at']

    def get_user_name(self, obj):
        full = obj.user.get_full_name()
        return full if full.strip() else obj.user.email

    def validate_email(self, value):
        return value.lower()

    def create(self, validated_data):
        email = validated_data.pop('email', None)
        if email:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            user, _ = User.objects.get_or_create(
                email__iexact=email,
                defaults={
                    'email': email,
                    'username': email,
                },
            )
            validated_data['user'] = user
        return super().create(validated_data)



class CsmNotificationSerializer(serializers.ModelSerializer):
    sender_email = serializers.EmailField(source='sender.email', read_only=True, default=None)
    sender_name = serializers.SerializerMethodField()
    organisation_name = serializers.CharField(source='organisation.name', read_only=True, default=None)

    class Meta:
        model = CsmNotification
        fields = [
            'id', 'recipient', 'sender', 'sender_email', 'sender_name',
            'notification_type', 'title', 'message', 'metadata',
            'is_read', 'action_status',
            'organisation', 'organisation_name',
            'created_at',
        ]
        read_only_fields = ['id', 'recipient', 'sender', 'created_at']

    def get_sender_name(self, obj):
        if not obj.sender:
            return None
        full = obj.sender.get_full_name()
        return full if full.strip() else obj.sender.email
