from rest_framework import serializers

from tracking.models import TrackingEvent


class TrackingEventListSerializer(serializers.ModelSerializer):
    content_type_str = serializers.SerializerMethodField()

    class Meta:
        model = TrackingEvent
        fields = [
            'id',
            'session_id',
            'user_id',
            'content_type_str',
            'object_id',
            'event_type',
            'source',
            'schema_version',
            'occurred_at',
            'created_at',
            'metadata',
            'project_id',
            'client_event_id',
        ]

    def get_content_type_str(self, obj):
        if obj.content_type_id is None:
            return None
        return f"{obj.content_type.app_label}.{obj.content_type.model}"
