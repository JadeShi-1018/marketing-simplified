from django.db import migrations, models


def ensure_edge_type_column(apps, schema_editor):
    """Add edge_type when missing; no-op when column already exists (local dev DB)."""
    with schema_editor.connection.cursor() as cursor:
        columns = {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(
                cursor,
                "decision_edges",
            )
        }
        if "edge_type" in columns:
            return
        schema_editor.execute(
            "ALTER TABLE decision_edges "
            "ADD COLUMN edge_type varchar(32) NOT NULL DEFAULT 'RELATED'"
        )


class Migration(migrations.Migration):

    dependencies = [
        ('decision', '0006_alter_decisionstatetransition_from_status_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='decisionedge',
                    name='edge_type',
                    field=models.CharField(
                        choices=[
                            ('FOLLOW_UP', 'Follow-up'),
                            ('RELATED', 'Related'),
                        ],
                        default='RELATED',
                        max_length=32,
                    ),
                ),
            ],
            database_operations=[
                migrations.RunPython(ensure_edge_type_column, migrations.RunPython.noop),
            ],
        ),
    ]
