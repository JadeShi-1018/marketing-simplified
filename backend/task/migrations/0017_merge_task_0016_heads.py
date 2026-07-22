# Generated manually to merge duplicate task 0016 leaf migrations
# (restored 0016_merge_task_0015_heads vs. 0016_task_slug) after
# restoring historical migrations per backend/MIGRATIONS.md.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('task', '0016_merge_task_0015_heads'),
        ('task', '0016_task_slug'),
    ]

    operations = [
    ]
