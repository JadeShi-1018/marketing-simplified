from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [
        ("task", "0008_merge_task_lineage_and_planned_start"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="linear_issue_id",
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text="Linear issue UUID when this task was imported from Linear.",
                max_length=64,
                null=True,
            ),
        ),
        migrations.AddConstraint(
            model_name="task",
            constraint=models.UniqueConstraint(
                condition=Q(linear_issue_id__isnull=False),
                fields=("project", "linear_issue_id"),
                name="task_unique_linear_issue_per_project",
            ),
        ),
    ]
