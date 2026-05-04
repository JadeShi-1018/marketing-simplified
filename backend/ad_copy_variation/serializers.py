from rest_framework import serializers

from .models import AdCopyVariation


class AdCopyVariationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdCopyVariation
        fields = [
            'id', 'creative', 'source_mode', 'source_ref',
            'hook', 'headline', 'description', 'cta',
            'instruction', 'model_name', 'prompt_version',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']
