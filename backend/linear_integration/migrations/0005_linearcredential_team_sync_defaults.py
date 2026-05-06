from django.db import migrations


def _relax_team_sync_columns(apps, schema_editor):
    """Legacy table may require default_team_id / sync_enabled; ensure DB defaults and nullable."""
    conn = schema_editor.connection
    if conn.vendor != "postgresql":
        return
    table = "linear_integration_linearcredential"
    with conn.cursor() as cursor:
        cursor.execute(
            f"ALTER TABLE {table} ALTER COLUMN default_team_id SET DEFAULT '';"
        )
        cursor.execute(
            f"ALTER TABLE {table} ALTER COLUMN sync_enabled SET DEFAULT true;"
        )
        cursor.execute(
            f"ALTER TABLE {table} ALTER COLUMN default_team_id DROP NOT NULL;"
        )
        cursor.execute(
            f"ALTER TABLE {table} ALTER COLUMN sync_enabled DROP NOT NULL;"
        )


def _noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("linear_integration", "0004_linearcredential_legacy_columns"),
    ]

    operations = [
        migrations.RunPython(_relax_team_sync_columns, _noop),
    ]
