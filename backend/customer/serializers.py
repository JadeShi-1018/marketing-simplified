from rest_framework import serializers
from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    experience_group_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Customer
        fields = [
            'id',
            'email',
            'full_name',
            'company',
            'phone',
            'experience_group',
            'experience_group_name',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'experience_group_name']

    def get_experience_group_name(self, obj):
        if obj.experience_group_id:
            return obj.experience_group.name
        return None

    def validate_email(self, value):
        qs = Customer.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A customer with this email already exists.")
        return value.lower()
