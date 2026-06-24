# Merge migration: resolves conflicts between MED-229 and prod-preview branches
# MED-229 added: 0009_remove_active_project_fk_constraint
# prod-preview added: 0009_merge_project_slug_org_admin
# This merge migration unifies both branches

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_merge_project_slug_org_admin'),
        ('core', '0009_remove_active_project_fk_constraint'),
    ]

    operations = []
