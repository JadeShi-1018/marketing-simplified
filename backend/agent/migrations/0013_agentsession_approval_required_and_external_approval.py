import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("agent", "0012_remove_importeddatafield_unique_imported_data_field_position_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="agentsession",
            name="approval_required",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="AgentPendingExternalApproval",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_deleted", models.BooleanField(default=False)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "kind",
                    models.CharField(
                        max_length=64,
                        help_text="Registry key: task, miro_board, calendar_event, forward_message, distribute_bulk, custom_api, email",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("approved", "Approved"),
                            ("rejected", "Rejected"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("draft", models.JSONField(default=dict)),
                ("commit_context", models.JSONField(default=dict)),
                ("destination_options", models.JSONField(default=list)),
                ("default_destination", models.JSONField(blank=True, null=True)),
                (
                    "session",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pending_external_approvals",
                        to="agent.agentsession",
                    ),
                ),
                (
                    "workflow_run",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="pending_external_approvals",
                        to="agent.agentworkflowrun",
                    ),
                ),
                (
                    "step_execution",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="pending_external_approvals",
                        to="agent.agentstepexecution",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AlterField(
            model_name="agentworkflowrun",
            name="status",
            field=models.CharField(
                choices=[
                    ("analyzing", "Analyzing"),
                    ("awaiting_confirmation", "Awaiting Confirmation"),
                    ("awaiting_external_approval", "Awaiting External Approval"),
                    ("creating_decision", "Creating Decision"),
                    ("creating_tasks", "Creating Tasks"),
                    ("completed", "Completed"),
                    ("failed", "Failed"),
                ],
                default="analyzing",
                max_length=40,
            ),
        ),
        migrations.AlterField(
            model_name="agentmessage",
            name="message_type",
            field=models.CharField(
                choices=[
                    ("text", "Text"),
                    ("analysis", "Analysis"),
                    ("decision_draft", "Decision Draft"),
                    ("task_created", "Task Created"),
                    ("confirmation_request", "Confirmation Request"),
                    ("approval_request", "Approval Request"),
                    ("follow_up_prompt", "Follow-up Prompt"),
                    ("error", "Error"),
                ],
                default="text",
                max_length=30,
            ),
        ),
    ]
