from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Align Django state with the real table (legacy / hand-rolled schema):
    - organization_id is varchar(64), not an FK to core.Organization
    - default_team_id and sync_enabled exist in DB and are NOT NULL
    """

    dependencies = [
        ("linear_integration", "0003_linearcredential_organization_name"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RemoveField(
                    model_name="linearcredential",
                    name="organization",
                ),
                migrations.AddField(
                    model_name="linearcredential",
                    name="linear_workspace_key",
                    field=models.CharField(
                        blank=True,
                        db_column="organization_id",
                        default="",
                        help_text="Legacy column organization_id (varchar). MediaJira org id as string and/or Linear workspace key.",
                        max_length=64,
                    ),
                ),
                migrations.AddField(
                    model_name="linearcredential",
                    name="default_team_id",
                    field=models.CharField(blank=True, default="", max_length=64),
                ),
                migrations.AddField(
                    model_name="linearcredential",
                    name="sync_enabled",
                    field=models.BooleanField(default=True),
                ),
            ],
        ),
    ]
