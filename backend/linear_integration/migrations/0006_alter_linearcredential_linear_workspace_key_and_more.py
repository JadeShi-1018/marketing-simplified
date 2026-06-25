from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("linear_integration", "0005_linearcredential_team_sync_defaults"),
    ]

    operations = [
        migrations.AlterField(
            model_name="linearcredential",
            name="linear_workspace_key",
            field=models.CharField(
                blank=True,
                db_column="organization_id",
                default="",
                help_text="Legacy varchar column; MediaJira org id as string and/or future Linear workspace id.",
                max_length=64,
            ),
        ),
        migrations.AlterField(
            model_name="linearcredential",
            name="organization_name",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Denormalized org name for display.",
                max_length=255,
            ),
        ),
    ]
