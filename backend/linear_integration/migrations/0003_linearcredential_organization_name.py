from django.db import migrations, models


def _sync_organization_name_column(apps, schema_editor):
    """Denormalized organization_name exists in some DBs with NOT NULL; allow null or add column."""
    connection = schema_editor.connection
    table = "linear_integration_linearcredential"
    with connection.cursor() as cursor:
        if connection.vendor == "postgresql":
            cursor.execute(
                """
                SELECT is_nullable FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = %s
                  AND column_name = 'organization_name'
                """,
                [table],
            )
            row = cursor.fetchone()
            if row:
                if row[0] == "NO":
                    cursor.execute(
                        f"ALTER TABLE {table} ALTER COLUMN organization_name DROP NOT NULL"
                    )
                return
            cursor.execute(
                f"""
                ALTER TABLE {table}
                ADD COLUMN organization_name varchar(255) NULL
                """
            )
        elif connection.vendor == "sqlite":
            cursor.execute(f"PRAGMA table_info({table})")
            cols = {r[1] for r in cursor.fetchall()}
            if "organization_name" in cols:
                return
            cursor.execute(
                f"""
                ALTER TABLE {table}
                ADD COLUMN organization_name varchar(255) DEFAULT ''
                """
            )


def _noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("linear_integration", "0002_linearcredential_organization"),
    ]

    operations = []
