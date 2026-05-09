import django.db.models.deletion
from django.db import migrations, models


def forwards(_apps, schema_editor):
    # Use the real model here: RunPython in SeparateDatabaseAndState receives *pre*-state
    # apps, so apps.get_model("linear_integration", "LinearTaskLink") raises LookupError.
    from linear_integration.models import LinearTaskLink

    table = LinearTaskLink._meta.db_table
    connection = schema_editor.connection

    if table not in connection.introspection.table_names():
        schema_editor.create_model(LinearTaskLink)
        return

    if connection.vendor != "postgresql":
        return

    qn = connection.ops.quote_name
    tbl = qn(table)
    rel = qn("task_task")
    fk_name = qn("linear_integration_lineartasklink_task_id_fk_task_task")
    task_id_col = qn("task_id")
    id_col = qn("id")

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT c.conname
            FROM pg_constraint c
            JOIN pg_class rel ON rel.oid = c.conrelid
            WHERE rel.relname = %s
              AND c.contype = 'f'
              AND c.confrelid = 'task_task'::regclass
            """,
            [table],
        )
        for (conname,) in cursor.fetchall():
            cursor.execute(
                "ALTER TABLE {} DROP CONSTRAINT {}".format(tbl, qn(conname))
            )

        cursor.execute("ALTER TABLE {} DROP CONSTRAINT IF EXISTS {}".format(tbl, fk_name))

        cursor.execute(
            """
            ALTER TABLE {tbl}
            ADD CONSTRAINT {fk}
            FOREIGN KEY ({task_id}) REFERENCES {rel} ({id_col})
            ON DELETE CASCADE
            """.format(
                tbl=tbl,
                fk=fk_name,
                task_id=task_id_col,
                rel=rel,
                id_col=id_col,
            )
        )


class Migration(migrations.Migration):

    dependencies = [
        ("linear_integration", "0006_alter_linearcredential_linear_workspace_key_and_more"),
        ("task", "0009_task_linear_issue_id"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name="LinearTaskLink",
                    fields=[
                        (
                            "id",
                            models.BigAutoField(
                                auto_created=True,
                                primary_key=True,
                                serialize=False,
                                verbose_name="ID",
                            ),
                        ),
                        (
                            "task",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.CASCADE,
                                related_name="linear_links",
                                to="task.task",
                            ),
                        ),
                        (
                            "linear_issue_id",
                            models.CharField(blank=True, default="", max_length=64),
                        ),
                    ],
                    options={
                        "db_table": "linear_integration_lineartasklink",
                    },
                ),
            ],
            database_operations=[
                migrations.RunPython(forwards, migrations.RunPython.noop),
            ],
        ),
    ]
