from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0003_fix_column_names"),
    ]

    operations = [
        migrations.AddField(
            model_name="notification",
            name="responded",
            field=models.BooleanField(default=False, db_index=True),
        ),
        migrations.AddField(
            model_name="notification",
            name="response",
            field=models.CharField(
                max_length=16,
                blank=True,
                default="",
                choices=[("accept", "Accepted"), ("reject", "Rejected")],
            ),
        ),
    ]
