# Data migration for multi-organization support

from django.conf import settings
from django.db import migrations, models


def migrate_existing_memberships(apps, schema_editor):
    """
    Data migration: Convert existing user.organization relationships
    to OrganizationMembership records.
    """
    CustomUser = apps.get_model('core', 'CustomUser')
    OrganizationMembership = apps.get_model('core', 'OrganizationMembership')

    # Get users with organizations
    users_with_org = CustomUser.objects.filter(organization__isnull=False).select_related('organization')

    memberships = []
    for user in users_with_org:
        # Determine if user is admin by checking tenant schema UserRole
        is_admin = False

        # Try to check UserRole in tenant schema (may fail if schema doesn't exist yet)
        try:
            # Import here to avoid import errors
            from django.db import connection
            from access_control.models import UserRole

            # Temporarily set search_path to tenant schema
            org_slug = user.organization.slug.replace('-', '_')
            schema_name = f"org_{org_slug}"

            with connection.cursor() as cursor:
                # Check if schema exists
                cursor.execute("""
                    SELECT schema_name FROM information_schema.schemata
                    WHERE schema_name = %s
                """, [schema_name])

                if cursor.fetchone():
                    # Schema exists, check for admin role
                    cursor.execute(f"SET search_path TO {schema_name};")

                    is_admin = UserRole.objects.filter(
                        user=user,
                        role__organization=user.organization,
                        role__level=2  # Organization Admin
                    ).exists()

                    # Reset to public schema
                    cursor.execute("SET search_path TO public;")
        except Exception:
            # If there's any error, default to member role
            # This is safer than assuming admin
            pass

        membership = OrganizationMembership(
            user=user,
            organization=user.organization,
            role='admin' if is_admin else 'member',
            is_active=True,
        )
        memberships.append(membership)

    # Bulk create memberships
    if memberships:
        OrganizationMembership.objects.bulk_create(memberships, ignore_conflicts=True)

    # Set current_organization = organization for all users
    CustomUser.objects.filter(organization__isnull=False).update(
        current_organization_id=models.F('organization_id')
    )


def reverse_migration(apps, schema_editor):
    """Reverse migration - clear OrganizationMembership table"""
    OrganizationMembership = apps.get_model('core', 'OrganizationMembership')
    OrganizationMembership.objects.all().delete()

    # Clear current_organization references
    CustomUser = apps.get_model('core', 'CustomUser')
    CustomUser.objects.all().update(current_organization_id=None)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0011_customuser_current_organization_and_more'),
    ]

    operations = [
        migrations.RunPython(
            migrate_existing_memberships,
            reverse_migration
        ),
    ]
