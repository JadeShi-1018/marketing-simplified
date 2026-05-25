# Generated manually for notifications app

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="UserNotificationPreference",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("preferences", models.JSONField(default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notification_preference",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "user_notification_preferences",
            },
        ),
        migrations.CreateModel(
            name="Notification",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("category", models.CharField(choices=[("MEETINGS", "Meetings"), ("TASKS", "Tasks"), ("DECISIONS", "Decisions"), ("APPROVAL", "Approval"), ("SYSTEM", "System")], db_index=True, max_length=32)),
                ("event_type", models.CharField(choices=[("meeting_created", "Meeting created"), ("meeting_updated", "Meeting updated"), ("meeting_participant_added", "Added to meeting"), ("meeting_participant_removed", "Removed from meeting"), ("meeting_starting_soon", "Meeting starting soon"), ("meeting_agenda_changed", "Agenda changed"), ("task_assigned", "Task assigned"), ("task_owner_changed", "Task owner changed"), ("task_status_changed", "Task status changed"), ("task_deadline_soon", "Deadline approaching"), ("task_overdue", "Task overdue"), ("task_comment_mention", "Mentioned in comment"), ("task_anomaly", "Task anomaly alert"), ("decision_review_needed", "Decision needs review"), ("decision_deadline", "Decision deadline"), ("decision_published", "Decision published"), ("budget_approval_result", "Budget approval result"), ("project_invite", "Project invitation"), ("workflow_node", "Workflow node update"), ("account_permission", "Account permission changed"), ("billing_anomaly", "Billing anomaly"), ("system", "System")], db_index=True, max_length=64)),
                ("related_object_type", models.CharField(blank=True, default="", max_length=64)),
                ("related_object_id", models.CharField(blank=True, default="", max_length=64)),
                ("title", models.CharField(max_length=255)),
                ("body", models.TextField(blank=True, default="")),
                ("is_read", models.BooleanField(db_index=True, default=False)),
                ("action_url", models.CharField(blank=True, default="", max_length=1024)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="notifications_triggered", to=settings.AUTH_USER_MODEL)),
                ("recipient", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notifications", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["recipient", "-created_at"], name="notificatio_recipie_0f8a2d_idx"),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["recipient", "is_read"], name="notificatio_recipie_6f1a9c_idx"),
        ),
    ]
