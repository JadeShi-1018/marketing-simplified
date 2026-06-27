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

    operations = []
