from django.db import migrations


def _relax_team_sync_columns(apps, schema_editor):
    """Legacy table may require default_team_id / sync_enabled; ensure DB defaults and nullable."""
    conn = schema_editor.connection
    if conn.vendor not in {"postgresql", "sqlite"}:
        return
    table = "linear_integration_linearcredential"
    with conn.cursor() as cursor:
        if conn.vendor == "postgresql":
            cursor.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = %s
                  AND column_name IN ('default_team_id', 'sync_enabled')
                """,
                [table],
            )
            existing_columns = {row[0] for row in cursor.fetchall()}

            if "default_team_id" not in existing_columns:
                cursor.execute(
                    f"ALTER TABLE {table} ADD COLUMN default_team_id varchar(64) DEFAULT '';"
                )
            if "sync_enabled" not in existing_columns:
                cursor.execute(
                    f"ALTER TABLE {table} ADD COLUMN sync_enabled boolean DEFAULT true;"
                )

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
            return

        cursor.execute(f"PRAGMA table_info({table})")
        existing_columns = {row[1] for row in cursor.fetchall()}
        if "default_team_id" not in existing_columns:
            cursor.execute(
                f"ALTER TABLE {table} ADD COLUMN default_team_id varchar(64) DEFAULT '';"
            )
        if "sync_enabled" not in existing_columns:
            cursor.execute(
                f"ALTER TABLE {table} ADD COLUMN sync_enabled bool DEFAULT 1;"
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
