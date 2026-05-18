from rest_framework import serializers

from .models import BehavioralSignal, FocusSession
from .services import MAX_SIGNALS_PER_BATCH


class FocusSessionCreateSerializer(serializers.ModelSerializer):
    """Input for POST /sessions/. user is injected server-side."""

    class Meta:
        model = FocusSession
        fields = ["task"]


class FocusSessionSerializer(serializers.ModelSerializer):
    """Output for GET /sessions/ and GET /sessions/<id>/."""

    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = FocusSession
        fields = [
            "id",
            "task",
            "user",
            "started_at",
            "ended_at",
            "is_active",
            "total_focused_ms",
            "total_keystrokes",
            "total_backspaces",
            "total_tab_switches",
            "total_rapid_switches",
            "total_mouse_hesitations",
            "total_inactivity_pauses",
            "total_repeated_navigations",
            "total_abnormal_interruptions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class BehavioralSignalSerializer(serializers.ModelSerializer):
    """Output for GET /sessions/<id>/signals/."""

    class Meta:
        model = BehavioralSignal
        fields = [
            "id",
            "session",
            "window_started_at",
            "window_ended_at",
            "focused_ms",
            "keystroke_count",
            "backspace_count",
            "tab_switch_count",
            "rapid_switch_count",
            "mouse_hesitation_count",
            "inactivity_pause_count",
            "repeated_navigation_count",
            "abnormal_interruption_count",
            "recorded_at",
        ]
        read_only_fields = fields


class BehavioralSignalInputSerializer(serializers.Serializer):
    """One window snapshot uploaded by the frontend."""

    window_started_at = serializers.DateTimeField()
    window_ended_at = serializers.DateTimeField()
    focused_ms = serializers.IntegerField(min_value=0, default=0)
    keystroke_count = serializers.IntegerField(min_value=0, default=0)
    backspace_count = serializers.IntegerField(min_value=0, default=0)
    tab_switch_count = serializers.IntegerField(min_value=0, default=0)
    rapid_switch_count = serializers.IntegerField(min_value=0, default=0)
    mouse_hesitation_count = serializers.IntegerField(min_value=0, default=0)
    inactivity_pause_count = serializers.IntegerField(min_value=0, default=0)
    repeated_navigation_count = serializers.IntegerField(min_value=0, default=0)
    abnormal_interruption_count = serializers.IntegerField(min_value=0, default=0)

    def validate(self, attrs):
        if attrs["window_ended_at"] < attrs["window_started_at"]:
            raise serializers.ValidationError(
                {"window_ended_at": "window_ended_at must be >= window_started_at."}
            )
        return attrs


class BehavioralSignalBatchSerializer(serializers.Serializer):
    """Input for POST /sessions/<id>/signals/."""

    signals = BehavioralSignalInputSerializer(many=True, allow_empty=False)

    def validate_signals(self, value):
        if len(value) > MAX_SIGNALS_PER_BATCH:
            raise serializers.ValidationError(
                f"Cannot upload more than {MAX_SIGNALS_PER_BATCH} signals per request."
            )
        return value
