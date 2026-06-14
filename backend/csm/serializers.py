from rest_framework import serializers
from .models import (
    Queue, QueueAgent, QueueTeam, CustomerUser, CsmNotification,
    TicketForm, TicketFormField, TicketFormAssignment,
    SupportProject, CsmWorkType,
)


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


class TicketFormFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketFormField
        fields = [
            'id', 'field_key', 'label', 'field_type', 'is_required',
            'sort_order', 'options', 'field_config', 'help_text',
            'max_files', 'max_file_size_mb',
        ]
        read_only_fields = ['id']


class TicketFormListSerializer(serializers.ModelSerializer):
    assignment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = TicketForm
        fields = [
            'id', 'project', 'name', 'description',
            'is_default', 'is_active', 'assignment_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'assignment_count']


class TicketFormDetailSerializer(serializers.ModelSerializer):
    fields = TicketFormFieldSerializer(many=True, read_only=True)

    class Meta:
        model = TicketForm
        fields = [
            'id', 'project', 'name', 'description',
            'is_default', 'is_active', 'fields',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'project', 'is_default', 'created_at', 'updated_at', 'fields']


class TicketFormCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketForm
        fields = ['name', 'description']


class BulkFieldsSerializer(serializers.Serializer):
    fields = serializers.ListField(child=serializers.DictField(), allow_empty=False)


class TicketFormAssignmentSerializer(serializers.ModelSerializer):
    experience_group_name = serializers.CharField(
        source='experience_group.name', read_only=True, default=None,
    )
    support_project_name = serializers.CharField(
        source='support_project.name', read_only=True, default=None,
    )

    class Meta:
        model = TicketFormAssignment
        fields = [
            'id', 'form', 'experience_group', 'experience_group_name',
            'support_project', 'support_project_name', 'created_at',
        ]
        read_only_fields = [
            'id', 'form', 'experience_group', 'experience_group_name',
            'support_project', 'support_project_name', 'created_at',
        ]


class ReplaceAssignmentsSerializer(serializers.Serializer):
    experience_group_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list,
    )
    support_project_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list,
    )


class SupportProjectSerializer(serializers.ModelSerializer):
    default_queue_name = serializers.CharField(
        source='default_queue.name', read_only=True, default=None,
    )

    class Meta:
        model = SupportProject
        fields = ['id', 'name', 'is_archived', 'default_queue', 'default_queue_name']
        read_only_fields = ['id', 'default_queue_name']


class CsmWorkTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CsmWorkType
        fields = ['id', 'name', 'sort_order', 'is_active']
        read_only_fields = ['id']


class WorkTypeReorderSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )
