from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("task", "0009_task_linear_issue_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="owner_invite_pending",
            field=models.BooleanField(
                default=False,
                help_text="True while the assigned owner has not yet accepted the task assignment.",
            ),
        ),
        migrations.AddField(
            model_name="task",
            name="approver_invite_pending",
            field=models.BooleanField(
                default=False,
                help_text="True while the assigned approver has not yet accepted the approver assignment.",
            ),
        ),
    ]
