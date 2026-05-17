 # experience_group/serializers.py

from rest_framework import serializers
from .models import ExperienceGroup


class ExperienceGroupSerializer(serializers.ModelSerializer):
    """Creating and Editing the detail page"""

    customer_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ExperienceGroup
        fields = [
            'id',
            'name',
            'description',
            'status',
            'draft_snapshot',
            'created_by',
            'created_at',
            'updated_at',
            'published_at',
            'customer_count',
        ]
        read_only_fields = ['id', 'status', 'created_by', 'created_at', 'updated_at', 'published_at', 'customer_count']

    def get_customer_count(self, obj):
        return obj.customers.count()

    def validate_name(self, value):
        qs = ExperienceGroup.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A group with this name already exists.")
        return value


class ExperienceGroupListSerializer(serializers.ModelSerializer):
    """For list page, only return necessary fields, reduce data transmission"""

    class Meta:
        model = ExperienceGroup
        fields = [
            'id',
            'name',
            'description',
            'status',
            'created_at',
            'updated_at',
        ]
