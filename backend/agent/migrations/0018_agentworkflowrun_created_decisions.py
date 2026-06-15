from django.db import migrations, models


def ensure_created_decisions_column(apps, schema_editor):
    """Add created_decisions when missing; no-op when column already exists."""
    with schema_editor.connection.cursor() as cursor:
        columns = {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(
                cursor,
                "agent_agentworkflowrun",
            )
        }
        if "created_decisions" in columns:
            return
        schema_editor.execute(
            "ALTER TABLE agent_agentworkflowrun "
            "ADD COLUMN created_decisions jsonb NOT NULL DEFAULT '[]'::jsonb"
        )


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0016_agentworkflowrun_generation_outputs_requested'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='agentworkflowrun',
                    name='created_decisions',
                    field=models.JSONField(blank=True, default=list),
                ),
            ],
            database_operations=[
                migrations.RunPython(ensure_created_decisions_column, migrations.RunPython.noop),
            ],
        ),
    ]
