from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("task", "0008_merge_task_lineage_and_planned_start"),
    ]

    operations = [
        migrations.CreateModel(
            name="TaskLabel",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=80)),
                ("color", models.CharField(default="#6B7280", help_text="Display color as #RRGGBB", max_length=7)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "project",
                    models.ForeignKey(
                        help_text="Labels are scoped to a single project",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="task_labels",
                        to="core.project",
                    ),
                ),
            ],
            options={
                "db_table": "task_labels",
                "ordering": ["name"],
            },
        ),
        migrations.AddField(
            model_name="task",
            name="labels",
            field=models.ManyToManyField(
                blank=True,
                help_text="Project-defined labels (multi-select, colored).",
                related_name="tasks",
                to="task.tasklabel",
            ),
        ),
        migrations.AddConstraint(
            model_name="tasklabel",
            constraint=models.UniqueConstraint(fields=("project", "name"), name="task_label_unique_name_per_project"),
        ),
    ]
