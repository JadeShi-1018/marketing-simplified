from rest_framework import serializers


class LinearImportIssuesSerializer(serializers.Serializer):
    project_id = serializers.IntegerField(min_value=1)
    team_id = serializers.CharField(max_length=64)
    issue_ids = serializers.ListField(
        child=serializers.CharField(max_length=64),
        min_length=1,
        max_length=100,
    )


class LinearPushTaskSerializer(serializers.Serializer):
    task_id = serializers.IntegerField(min_value=1)
    team_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
