from django.db import migrations


def backfill_org_admin_fallback(apps, schema_editor):
    """
    DEPRECATED: This migration has been executed in production and is now a no-op.

    Historical context:
    This migration was a fallback for granting Organization Admin roles to
    early users when CustomerUser.is_creator was missing. However,
    access_control models have been moved to tenant schemas, so this migration
    can no longer run against public schema.

    The data migration was completed before the schema restructuring, so
    skipping it on new test databases is safe.
    """
    # No-op: access_control models now live in tenant schemas
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0007_backfill_org_admin'),
        ('csm', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(
            backfill_org_admin_fallback,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
