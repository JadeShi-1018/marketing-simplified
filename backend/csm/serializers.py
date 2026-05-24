from rest_framework import serializers
from .models import Queue, QueueAgent, QueueTeam, CSMInvitation


class QueueSerializer(serializers.ModelSerializer):
    tier_display = serializers.CharField(source='get_tier_display', read_only=True)

    class Meta:
        model = Queue
        fields = [
            'id', 'project', 'name', 'description',
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


class CSMInvitationSerializer(serializers.ModelSerializer):
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = CSMInvitation
        fields = [
            'id', 'email', 'project', 'team',
            'invited_by', 'token', 'expires_at',
            'accepted', 'accepted_at', 'is_expired',
            'created_at',
        ]
        read_only_fields = ['id', 'token', 'expires_at', 'accepted', 'accepted_at', 'created_at']
