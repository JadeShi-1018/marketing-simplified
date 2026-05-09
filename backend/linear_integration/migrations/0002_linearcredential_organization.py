import django.db.models.deletion
from django.db import migrations, models


def _sync_organization_column(apps, schema_editor):
    """Align DB with model: add nullable organization_id or relax NOT NULL if column was added out-of-band."""
    connection = schema_editor.connection
    table = "linear_integration_linearcredential"
    with connection.cursor() as cursor:
        if connection.vendor == "postgresql":
            cursor.execute(
                """
                SELECT is_nullable FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = %s
                  AND column_name = 'organization_id'
                """,
                [table],
            )
            row = cursor.fetchone()
            if row:
                if row[0] == "NO":
                    cursor.execute(
                        f"ALTER TABLE {table} ALTER COLUMN organization_id DROP NOT NULL"
                    )
                return
            cursor.execute(
                f"""
                ALTER TABLE {table}
                ADD COLUMN organization_id bigint NULL
                CONSTRAINT linear_integration_linearcredential_organization_id_fk
                REFERENCES core_organization(id)
                ON DELETE CASCADE
                DEFERRABLE INITIALLY DEFERRED
                """
            )
        elif connection.vendor == "sqlite":
            cursor.execute(f"PRAGMA table_info({table})")
            cols = {r[1] for r in cursor.fetchall()}
            if "organization_id" in cols:
                return
            cursor.execute(
                f"""
                ALTER TABLE {table}
                ADD COLUMN organization_id bigint NULL REFERENCES core_organization(id)
                """
            )


def _noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_initial"),
        ("linear_integration", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(_sync_organization_column, _noop_reverse),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="linearcredential",
                    name="organization",
                    field=models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="linear_credentials",
                        to="core.organization",
                    ),
                ),
            ],
        ),
    ]
