from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("comments", "0002_comment_is_edited_ordering"),
    ]

    operations = [
        migrations.AddField(
            model_name="commentattachment",
            name="preview_error",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="commentattachment",
            name="preview_metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="commentattachment",
            name="preview_status",
            field=models.CharField(
                choices=[
                    ("unsupported", "Unsupported"),
                    ("pending", "Pending"),
                    ("processing", "Processing"),
                    ("ready", "Ready"),
                    ("failed", "Failed"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
    ]
