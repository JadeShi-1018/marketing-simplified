from collections import defaultdict

from django.db import connection, migrations, models


def copy_m2m_labels_to_tags(apps, schema_editor):
    Task = apps.get_model("task", "Task")
    if not connection.introspection.table_names():
        return

    names = connection.introspection.table_names()
    if "task_task_labels" not in names or "task_labels" not in names:
        return

    buckets = defaultdict(list)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT m.task_id, l.name, l.color
            FROM task_task_labels m
            INNER JOIN task_labels l ON l.id = m.tasklabel_id
            ORDER BY m.task_id, l.name
            """
        )
        for task_id, name, color in cursor.fetchall():
            buckets[task_id].append({"name": name, "color": (color or "").upper()})

    for task_id, tag_list in buckets.items():
        Task.objects.filter(pk=task_id).update(tags=tag_list)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("task", "0009_tasklabel_task_labels"),
    ]

    operations = []
