from rest_framework import serializers

from .models import Notification, default_notification_preferences


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    actor_avatar = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id",
            "category",
            "event_type",
            "related_object_type",
            "related_object_id",
            "title",
            "body",
            "is_read",
            "action_url",
            "metadata",
            "created_at",
            "responded",
            "response",
            "actor_name",
            "actor_avatar",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if obj.actor:
            return obj.actor.get_full_name() or obj.actor.username
        return None

    def get_actor_avatar(self, obj):
        if obj.actor and obj.actor.avatar:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.actor.avatar.url)
            return obj.actor.avatar.url
        return None


class NotificationRespondSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["accept", "reject"])


class NotificationMarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )
    mark_all = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if not attrs.get("mark_all") and not attrs.get("ids"):
            raise serializers.ValidationError("Provide `ids` or set `mark_all` to true.")
        return attrs


class NotificationClearSerializer(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["all", "read", "ids"], default="ids")
    ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )

    def validate(self, attrs):
        scope = attrs.get("scope") or "ids"
        if scope == "ids" and not attrs.get("ids"):
            raise serializers.ValidationError("`ids` is required when scope is `ids`.")
        return attrs


class UserNotificationPreferencePatchSerializer(serializers.Serializer):
    preferences = serializers.JSONField(required=True)

    def validate_preferences(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("preferences must be a JSON object.")
        return value
