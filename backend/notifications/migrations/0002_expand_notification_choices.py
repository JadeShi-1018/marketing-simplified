# Expanded category/event choices for SMP-435 preference groups

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notification",
            name="category",
            field=models.CharField(
                choices=[
                    ("COLLABORATION", "Collaboration"),
                    ("MEETINGS", "Meetings"),
                    ("TASKS", "Tasks"),
                    ("DECISIONS", "Decisions"),
                    ("APPROVAL", "Approval"),
                    ("SYSTEM", "System"),
                    ("AUTOMATION", "Automation"),
                    ("INTEGRATIONS", "Integrations"),
                ],
                db_index=True,
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name="notification",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("chat_new_message", "Chat new message"),
                    ("chat_new_conversation", "Chat new conversation"),
                    ("project_invite", "Project invitation"),
                    ("calendar_reminder", "Calendar reminder"),
                    ("doc_asset_update", "Document or asset update"),
                    ("meeting_created", "Meeting created"),
                    ("meeting_updated", "Meeting updated"),
                    ("meeting_participant_added", "Added to meeting"),
                    ("meeting_participant_removed", "Removed from meeting"),
                    ("meeting_starting_soon", "Meeting starting soon"),
                    ("meeting_agenda_changed", "Agenda changed"),
                    ("meeting_minutes_published", "Minutes published"),
                    ("task_assigned", "Task assigned"),
                    ("task_owner_changed", "Task owner changed"),
                    ("task_status_changed", "Task status changed"),
                    ("task_deadline_soon", "Deadline approaching"),
                    ("task_overdue", "Task overdue"),
                    ("task_comment_mention", "Mentioned in comment"),
                    ("task_anomaly", "Task anomaly alert"),
                    ("decision_review_needed", "Decision needs review"),
                    ("decision_deadline", "Decision deadline"),
                    ("decision_published", "Decision published"),
                    ("budget_approval_result", "Budget approval result"),
                    ("workflow_node", "Workflow node update"),
                    ("account_permission", "Account permission changed"),
                    ("billing_anomaly", "Billing anomaly"),
                    ("system", "System"),
                ],
                db_index=True,
                max_length=64,
            ),
        ),
    ]
