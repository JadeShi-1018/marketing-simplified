from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_initial"),
        ("decision", "0008_decision_topic"),
    ]

    operations = [
        migrations.CreateModel(
            name="DecisionTopicLabel",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_deleted", models.BooleanField(default=False)),
                ("topic", models.CharField(max_length=64)),
                ("title", models.CharField(max_length=80)),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="decision_topic_labels",
                        to="core.project",
                    ),
                ),
            ],
            options={
                "db_table": "decision_topic_labels",
            },
        ),
        migrations.AddConstraint(
            model_name="decisiontopiclabel",
            constraint=models.UniqueConstraint(
                fields=("project", "topic"),
                name="unique_project_decision_topic_label",
            ),
        ),
    ]
