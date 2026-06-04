"""DRF serializers for Quick Start API endpoints."""

from rest_framework import serializers

from core.services.quick_start.constants import (
    ALL_MODULES,
    MAX_COMBINED_INPUT_LENGTH,
)
from core.services.quick_start.exceptions import QuickStartValidationError
from core.services.quick_start.validation import validate_prompt_text, validate_supplement_text


class QuickStartModuleToggleSerializer(serializers.Serializer):
    tasks = serializers.BooleanField(required=False, default=True)
    spreadsheet = serializers.BooleanField(required=False, default=True)
    calendar = serializers.BooleanField(required=False, default=True)
    decisions = serializers.BooleanField(required=False, default=True)
    miro = serializers.BooleanField(required=False, default=True)


class QuickStartPreviewRequestSerializer(serializers.Serializer):
    step = serializers.ChoiceField(choices=[1, 2])
    prompt = serializers.CharField(
        required=True,
        allow_blank=False,
        trim_whitespace=True,
    )
    supplement = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        trim_whitespace=True,
    )
    chips = serializers.DictField(required=False, allow_empty=True)
    selected_modules = QuickStartModuleToggleSerializer(required=False)
    locale = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=32)

    def validate_prompt(self, value):
        try:
            return validate_prompt_text(value)
        except QuickStartValidationError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_supplement(self, value):
        try:
            return validate_supplement_text(value)
        except QuickStartValidationError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate(self, attrs):
        prompt = (attrs.get('prompt') or '').strip()
        supplement = (attrs.get('supplement') or '').strip()
        if len(prompt) + len(supplement) > MAX_COMBINED_INPUT_LENGTH:
            raise serializers.ValidationError(
                f'Prompt and supplement combined must be at most {MAX_COMBINED_INPUT_LENGTH} characters.'
            )
        return attrs

    def validate_selected_modules(self, value):
        if value is None:
            return None
        return {key: value.get(key, False) for key in ALL_MODULES}


class QuickStartConfirmRequestSerializer(serializers.Serializer):
    blueprint = serializers.DictField(required=True)
    project_title = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, trim_whitespace=True, max_length=200
    )
    selected_modules = QuickStartModuleToggleSerializer(required=False)

    def validate_blueprint(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('blueprint must be an object.')
        if value.get('version') != 1:
            raise serializers.ValidationError('blueprint.version must be 1.')
        if not isinstance(value.get('project'), dict):
            raise serializers.ValidationError('blueprint.project is required.')
        return value

    def validate_selected_modules(self, value):
        if value is None:
            return None
        return {key: value.get(key, False) for key in ALL_MODULES}
