from rest_framework import serializers
from .models import (
    Queue, QueueAgent, QueueTeam, CustomerUser, CsmNotification,
    Conversation, ConversationMessage, Ticket, QuickReplyTemplate, QuickReplyTemplateHistory,
    TicketForm, TicketFormField, TicketFormAssignment,
    SupportProject, CsmWorkType, SupportChannel,
)


class QueueSerializer(serializers.ModelSerializer):
    tier_display = serializers.CharField(source='get_tier_display', read_only=True)
    organisation_name = serializers.CharField(
        source='organisation.name', read_only=True, default=None,
    )

    class Meta:
        model = Queue
        fields = [
            'id', 'slug', 'project', 'organisation', 'organisation_name',
            'name', 'description',
            'tier', 'tier_display',
            'display_order', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'slug', 'created_at']


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


class ConversationMessageSerializer(serializers.ModelSerializer):
    sender_agent_name = serializers.SerializerMethodField()
    sender_agent_email = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ConversationMessage
        fields = [
            'id', 'conversation', 'sender_type',
            'sender_agent', 'sender_agent_name', 'sender_agent_email',
            'content', 'rich_body', 'image_url', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'conversation', 'sender_agent']

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def get_sender_agent_name(self, obj):
        if not obj.sender_agent:
            return None
        full = obj.sender_agent.user.get_full_name()
        return full if full.strip() else obj.sender_agent.user.email

    def get_sender_agent_email(self, obj):
        if not obj.sender_agent:
            return None
        return obj.sender_agent.user.email


class ConversationSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list view."""
    customer_name = serializers.CharField(source='customer.full_name', read_only=True, default=None)
    customer_email = serializers.CharField(source='customer.email', read_only=True, default=None)
    queue_name = serializers.CharField(source='queue.name', read_only=True, default=None)
    queue_organisation_id = serializers.IntegerField(source='queue.organisation_id', read_only=True, default=None)
    assigned_to_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    channel_display = serializers.CharField(source='get_channel_display', read_only=True)
    elapsed_seconds = serializers.IntegerField(read_only=True)
    ticket = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'customer', 'customer_name', 'customer_email',
            'queue', 'queue_name', 'queue_organisation_id',
            'assigned_to', 'assigned_to_name',
            'status', 'status_display',
            'channel', 'channel_display',
            'tags', 'started_at', 'ended_at', 'elapsed_seconds',
            'ticket', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'started_at']

    def get_assigned_to_name(self, obj):
        if not obj.assigned_to:
            return None
        full = obj.assigned_to.user.get_full_name()
        return full if full.strip() else obj.assigned_to.user.email

    def get_ticket(self, obj):
        t = obj.tickets.first()
        if not t:
            return None
        return {
            'id': t.id,
            'title': t.title,
            'status': t.status,
            'status_display': t.get_status_display(),
            'priority': t.priority,
            'priority_display': t.get_priority_display(),
            'assigned_to_name': (
                t.assigned_to.get_full_name() or t.assigned_to.email
                if t.assigned_to else None
            ),
        }


class CustomerProfileSerializer(serializers.Serializer):
    """Flattened customer profile for the conversation detail panel."""
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    email = serializers.EmailField()
    company = serializers.CharField()
    phone = serializers.CharField()
    organisation_id = serializers.IntegerField(source='organisation.id', default=None)
    organisation_name = serializers.CharField(source='organisation.name', default=None)
    region_name = serializers.CharField(source='region.name', default=None)


class ConversationDetailSerializer(ConversationSerializer):
    """Full serializer for conversation detail view — includes messages and customer profile."""
    messages = ConversationMessageSerializer(many=True, read_only=True)
    customer_profile = serializers.SerializerMethodField()
    linked_tickets = serializers.SerializerMethodField()

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ['messages', 'customer_profile', 'linked_tickets']

    def get_customer_profile(self, obj):
        if not obj.customer:
            return None
        return CustomerProfileSerializer(obj.customer).data

    def get_linked_tickets(self, obj):
        tickets = obj.tickets.all()
        return [
            {'id': t.id, 'title': t.title, 'status': t.status, 'priority': t.priority}
            for t in tickets
        ]


class TicketSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    queue_name = serializers.CharField(source='queue.name', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    sla = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            'id', 'queue', 'queue_name', 'title', 'description',
            'status', 'status_display', 'priority', 'priority_display',
            'assigned_to', 'assigned_to_name', 'customer_email',
            'conversation', 'created_at',
            'first_response_due', 'resolution_due', 'sla',
        ]
        read_only_fields = ['id', 'created_at', 'first_response_due', 'resolution_due']

    def get_assigned_to_name(self, obj):
        if not obj.assigned_to:
            return None
        full = obj.assigned_to.get_full_name()
        return full if full.strip() else obj.assigned_to.email

    def get_sla(self, obj):
        from csm.services.sla import get_sla_status
        return get_sla_status(obj)


class QuickReplyTemplateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = QuickReplyTemplate
        fields = [
            'id', 'organisation', 'team', 'title', 'content', 'rich_body',
            'tags', 'is_active', 'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        full = obj.created_by.get_full_name()
        return full if full.strip() else obj.created_by.email


class QuickReplyTemplateHistorySerializer(serializers.ModelSerializer):
    edited_by_name = serializers.SerializerMethodField()

    class Meta:
        model = QuickReplyTemplateHistory
        fields = ['id', 'edited_by', 'edited_by_name', 'edited_at', 'title', 'content', 'rich_body', 'tags']
        read_only_fields = ['id', 'edited_by', 'edited_by_name', 'edited_at', 'title', 'content', 'rich_body', 'tags']

    def get_edited_by_name(self, obj):
        if not obj.edited_by:
            return None
        full = obj.edited_by.get_full_name()
        return full if full.strip() else obj.edited_by.email


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
            'id', 'slug', 'project', 'name', 'description',
            'is_default', 'is_active', 'assignment_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'slug', 'created_at', 'updated_at', 'assignment_count']


class TicketFormDetailSerializer(serializers.ModelSerializer):
    fields = TicketFormFieldSerializer(many=True, read_only=True)

    class Meta:
        model = TicketForm
        fields = [
            'id', 'slug', 'project', 'name', 'description',
            'is_default', 'is_active', 'fields',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'slug', 'project', 'is_default', 'created_at', 'updated_at', 'fields']


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


class SupportChannelExperienceGroupSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class SupportChannelListSerializer(serializers.ModelSerializer):
    assignment_count = serializers.IntegerField(read_only=True)
    default_queue_name = serializers.CharField(
        source='default_queue.name', read_only=True, default=None,
    )
    experience_groups = serializers.SerializerMethodField()

    class Meta:
        model = SupportChannel
        fields = [
            'id', 'display_name', 'channel_type', 'is_active',
            'assignment_count', 'default_queue_name', 'experience_groups',
            'sort_order',
        ]
        read_only_fields = fields

    def get_experience_groups(self, obj):
        return [
            {'id': link.experience_group_id, 'name': link.experience_group.name}
            for link in obj.experience_group_links.all()
        ]


class SupportChannelDetailSerializer(serializers.ModelSerializer):
    assignment_count = serializers.IntegerField(read_only=True)
    default_queue_name = serializers.CharField(
        source='default_queue.name', read_only=True, default=None,
    )
    ticket_form_name = serializers.CharField(
        source='ticket_form.name', read_only=True, default=None,
    )
    experience_groups = serializers.SerializerMethodField()

    class Meta:
        model = SupportChannel
        fields = [
            'id', 'project', 'channel_type', 'display_name', 'welcome_message',
            'operating_hours', 'timezone', 'offline_fallback_message',
            'offline_alternative', 'offline_alternative_target_id',
            'default_queue', 'default_queue_name',
            'ticket_form', 'ticket_form_name',
            'email_address', 'embed_key', 'is_active', 'sort_order',
            'assignment_count', 'experience_groups',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'project', 'embed_key', 'assignment_count',
            'default_queue_name', 'ticket_form_name', 'experience_groups',
            'created_at', 'updated_at',
        ]

    def get_experience_groups(self, obj):
        return [
            {'id': link.experience_group_id, 'name': link.experience_group.name}
            for link in obj.experience_group_links.all()
        ]


class SupportChannelCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportChannel
        fields = [
            'channel_type', 'display_name', 'welcome_message', 'operating_hours',
            'timezone', 'offline_fallback_message', 'offline_alternative',
            'offline_alternative_target_id', 'default_queue', 'ticket_form',
            'email_address', 'sort_order', 'is_active',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields['channel_type'].read_only = True


class ReplaceChannelAssignmentsSerializer(serializers.Serializer):
    experience_group_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        default=list,
    )
