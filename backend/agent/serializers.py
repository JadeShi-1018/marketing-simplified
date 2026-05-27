from django.utils import timezone
from rest_framework import serializers
from .models import (
    AgentSession, AgentMessage, AgentWorkflowRun, ImportedCSVFile,
    AgentWorkflowDefinition, AgentWorkflowStep, AgentStepExecution,
    AgentPendingExternalApproval, AgentWorkflowTemplate,
    AgentProjectWorkflowBinding,
)


class AgentMessageSerializer(serializers.ModelSerializer):
    data = serializers.JSONField(source='metadata', read_only=True)

    class Meta:
        model = AgentMessage
        fields = ['id', 'role', 'content', 'message_type', 'data', 'created_at']
        read_only_fields = ['id', 'created_at']


class AgentSessionListSerializer(serializers.ModelSerializer):
    message_count = serializers.SerializerMethodField()
    has_unread = serializers.SerializerMethodField()

    class Meta:
        model = AgentSession
        fields = [
            'id', 'title', 'status', 'approval_required', 'is_pinned', 'last_read_at',
            'created_at', 'message_count', 'has_unread',
        ]
        read_only_fields = ['id', 'created_at', 'has_unread', 'is_pinned', 'last_read_at']

    def get_message_count(self, obj):
        return obj.messages.filter(is_deleted=False).count()

    def get_has_unread(self, obj):
        """True when an assistant message exists after last_read_at (or last_read_at unset)."""
        last_assistant = getattr(obj, '_last_assistant_at', None)
        if last_assistant is None:
            return False
        lr = obj.last_read_at
        if lr is None:
            return True
        return last_assistant > lr


class AgentSessionDetailSerializer(serializers.ModelSerializer):
    messages = AgentMessageSerializer(many=True, read_only=True)
    follow_up_available = serializers.SerializerMethodField()
    follow_up_started = serializers.SerializerMethodField()

    class Meta:
        model = AgentSession
        fields = [
            'id', 'title', 'status', 'approval_required', 'is_pinned', 'last_read_at',
            'created_at', 'updated_at', 'messages', 'follow_up_available', 'follow_up_started',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_status(self, value):
        allowed = {c[0] for c in AgentSession.STATUS_CHOICES}
        if value not in allowed:
            raise serializers.ValidationError('Invalid status.')
        return value

    def validate_last_read_at(self, value):
        if value is not None and value > timezone.now():
            raise serializers.ValidationError('last_read_at cannot be in the future.')
        return value

    def get_follow_up_available(self, obj):
        return obj.workflow_runs.filter(
            status='awaiting_confirmation',
            chat_follow_up_started=False,
            chat_followed_up=False,
            is_deleted=False,
        ).exists()

    def get_follow_up_started(self, obj):
        return obj.workflow_runs.filter(
            status='awaiting_confirmation',
            chat_follow_up_started=True,
            chat_followed_up=False,
            is_deleted=False,
        ).exists()


class AgentPendingExternalApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentPendingExternalApproval
        fields = [
            'id', 'kind', 'status', 'draft', 'destination_options',
            'default_destination', 'created_at',
        ]
        read_only_fields = fields


class ResolveExternalApprovalSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=['approve', 'reject'])
    draft = serializers.JSONField(required=False, default=dict)
    destination = serializers.JSONField(required=False, allow_null=True)


class AgentWorkflowRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentWorkflowRun
        fields = [
            'id', 'session', 'spreadsheet', 'decision',
            'workflow_definition', 'current_step_order', 'status',
            'analysis_result', 'created_tasks', 'error_message',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ImportedCSVFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportedCSVFile
        fields = [
            'id', 'filename', 'original_filename',
            'row_count', 'column_count', 'file_size',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class ChatInputSerializer(serializers.Serializer):
    message = serializers.CharField(required=True)
    spreadsheet_id = serializers.IntegerField(required=False, allow_null=True)
    csv_filename = serializers.RegexField(
        r'^[\w\-. ()]+\.(csv|xlsx|xls)$', required=False, allow_null=True,
        error_messages={'invalid': 'Invalid filename format.'}
    )
    file_id = serializers.UUIDField(required=False, allow_null=True)
    action = serializers.ChoiceField(
        choices=[
            'analyze', 'create_tasks', 'generate_miro',
            'distribute_message', 'start_follow_up', 'cancel_follow_up',
            'confirm_columns',
            'resolve_external_approval',
        ],
        required=False,
        allow_null=True,
    )
    approval_id = serializers.UUIDField(required=False, allow_null=True)
    approval_decision = serializers.ChoiceField(
        choices=['approve', 'reject'],
        required=False,
        allow_null=True,
    )
    approval_draft = serializers.JSONField(required=False, allow_null=True)
    calendar_context = serializers.JSONField(required=False, allow_null=True)
    workflow_id = serializers.UUIDField(required=False, allow_null=True)
    # User-approved column mapping for confirm_columns action.
    # Format: {original_header: canonical_name or "unknown"}
    column_mapping = serializers.JSONField(required=False, allow_null=True)


class AgentWorkflowStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentWorkflowStep
        fields = ['id', 'name', 'step_type', 'order', 'config', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {
            'order': {'required': False},
            'config': {'required': False},
            'description': {'required': False},
        }


class AgentWorkflowDefinitionListSerializer(serializers.ModelSerializer):
    step_count = serializers.SerializerMethodField()

    class Meta:
        model = AgentWorkflowDefinition
        fields = [
            'id', 'name', 'description', 'is_default', 'is_system',
            'status', 'step_count', 'created_at',
        ]
        read_only_fields = ['id', 'is_system', 'created_at']

    def get_step_count(self, obj):
        return obj.steps.filter(is_deleted=False).count()


class AgentWorkflowDefinitionDetailSerializer(serializers.ModelSerializer):
    steps = serializers.SerializerMethodField()

    class Meta:
        model = AgentWorkflowDefinition
        fields = [
            'id', 'name', 'description', 'is_default', 'is_system',
            'status', 'steps', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'is_system', 'created_at', 'updated_at']

    def get_steps(self, obj):
        active_steps = obj.steps.filter(is_deleted=False).order_by('order')
        return AgentWorkflowStepSerializer(active_steps, many=True).data


class AgentStepExecutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentStepExecution
        fields = [
            'id', 'step_order', 'step_name', 'status',
            'input_data', 'output_data', 'error_message',
            'started_at', 'completed_at',
        ]
        read_only_fields = ['id', 'started_at', 'completed_at']


class StepReorderSerializer(serializers.Serializer):
    step_ids = serializers.ListField(child=serializers.UUIDField())


class AgentWorkflowTemplateSerializer(serializers.ModelSerializer):
    """
    Serializer for AgentWorkflowTemplate with validation for share_scope.
    """
    workflow_name = serializers.CharField(source='workflow_definition.name', read_only=True)
    workflow_step_count = serializers.SerializerMethodField()
    applied_project_count = serializers.SerializerMethodField()
    source_workflow_id = serializers.UUIDField(write_only=True, required=False)

    class Meta:
        model = AgentWorkflowTemplate
        fields = [
            'id', 'name', 'description', 'category', 'share_scope',
            'workflow_definition', 'workflow_name', 'workflow_step_count',
            'created_by', 'organization', 'applied_project_count',
            'source_workflow_id', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'workflow_definition', 'created_by', 'organization', 'created_at', 'updated_at']

    def get_workflow_step_count(self, obj):
        """Return the number of active steps in the template's workflow."""
        if obj.workflow_definition:
            return obj.workflow_definition.steps.filter(is_deleted=False).count()
        return 0

    def get_applied_project_count(self, obj):
        """Return the number of projects using this template."""
        return obj.project_bindings.filter(is_active=True, is_deleted=False).count()

    def validate(self, attrs):
        """Validate share_scope and organization constraints."""
        request = self.context.get('request')
        share_scope = attrs.get('share_scope', self.instance.share_scope if self.instance else 'private')

        # Public scope not supported in MVP
        if share_scope == 'public':
            raise serializers.ValidationError({
                'share_scope': 'Public templates are not supported in this version.'
            })

        # Organization scope requires organization field
        if share_scope == 'organization':
            if not request or not request.user:
                raise serializers.ValidationError({
                    'share_scope': 'Cannot create organization template without user context.'
                })

            # Check if user has organization
            if not hasattr(request.user, 'organization') or not request.user.organization:
                raise serializers.ValidationError({
                    'share_scope': 'User does not belong to an organization.'
                })

            # Set organization automatically
            attrs['organization'] = request.user.organization
        else:
            # Private scope should have no organization
            attrs['organization'] = None

        return attrs

    def validate_source_workflow_id(self, value):
        """Validate that source workflow exists and is accessible."""
        from .models import AgentWorkflowDefinition

        workflow = AgentWorkflowDefinition.objects.filter(
            id=value,
            is_deleted=False
        ).first()

        if not workflow:
            raise serializers.ValidationError('Source workflow not found.')

        return value


class AgentProjectWorkflowBindingSerializer(serializers.ModelSerializer):
    """
    Serializer for AgentProjectWorkflowBinding with nested template details.
    """
    template_detail = AgentWorkflowTemplateSerializer(source='template', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    applied_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AgentProjectWorkflowBinding
        fields = [
            'id', 'project', 'project_name', 'template', 'template_detail',
            'trigger_mode', 'trigger_keywords', 'priority', 'is_default',
            'is_active', 'applied_by', 'applied_by_name', 'applied_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'applied_by', 'applied_at', 'created_at', 'updated_at']

    def get_applied_by_name(self, obj):
        """Return the name of the user who applied this binding."""
        if obj.applied_by:
            return f"{obj.applied_by.first_name} {obj.applied_by.last_name}".strip() or obj.applied_by.username
        return None

    def validate(self, attrs):
        """Validate binding constraints."""
        project = attrs.get('project', self.instance.project if self.instance else None)
        template = attrs.get('template', self.instance.template if self.instance else None)
        trigger_mode = attrs.get('trigger_mode', self.instance.trigger_mode if self.instance else None)

        # Validate template visibility
        request = self.context.get('request')
        if request and template:
            user = request.user

            # Check if user can access this template
            if template.share_scope == 'private':
                if template.created_by != user:
                    raise serializers.ValidationError({
                        'template': 'You do not have access to this private template.'
                    })
            elif template.share_scope == 'organization':
                if not hasattr(user, 'organization') or user.organization != template.organization:
                    raise serializers.ValidationError({
                        'template': 'You do not have access to this organization template.'
                    })

        # Validate trigger_keywords only for message_keyword mode
        if trigger_mode == 'message_keyword':
            keywords = attrs.get('trigger_keywords', [])
            if not keywords or not isinstance(keywords, list) or len(keywords) == 0:
                raise serializers.ValidationError({
                    'trigger_keywords': 'At least one keyword is required for message_keyword trigger mode.'
                })

        return attrs


class AgentProjectWorkflowBindingListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing active bindings (used in chat interface).
    """
    template_name = serializers.CharField(source='template.name', read_only=True)
    template_category = serializers.CharField(source='template.category', read_only=True)

    class Meta:
        model = AgentProjectWorkflowBinding
        fields = [
            'id', 'template_name', 'template_category',
            'trigger_mode', 'trigger_keywords', 'is_default',
        ]
        read_only_fields = fields
