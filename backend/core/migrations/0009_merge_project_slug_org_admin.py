# Merge migration: unifies the project-slug branch (SMP-539) with the
# org/stripe branch that landed on prod-preview. No schema operations.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_project_slug'),
        ('core', '0008_backfill_org_admin_fallback'),
    ]

    operations = []
