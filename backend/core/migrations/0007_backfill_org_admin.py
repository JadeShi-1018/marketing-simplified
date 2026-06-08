from django.db import migrations


def backfill_org_admin(apps, schema_editor):
    """
    For every org, find the user whose CustomerUser row has is_creator=True
    and grant them Organization Admin (level=2). This bootstraps the admin
    role for all orgs created before the registration-flow fix.
    """
    CustomerUser = apps.get_model('csm', 'CustomerUser')
    Role = apps.get_model('core', 'Role')
    UserRole = apps.get_model('access_control', 'UserRole')

    creators = (
        CustomerUser.objects
        .filter(
            is_creator=True,
            organisation__isnull=False,
            organisation__organization__isnull=False,
        )
        .select_related('user', 'organisation__organization')
    )

    for cu in creators:
        org = cu.organisation.organization
        user = cu.user

        admin_role, _ = Role.objects.get_or_create(
            organization=org,
            name='Organization Admin',
            defaults={'level': 2},
        )
        UserRole.objects.get_or_create(user=user, role=admin_role)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_org_stripe_customer'),
        ('access_control', '0002_initial'),
        ('csm', '0005_csm_notification_and_is_creator'),
    ]

    operations = [
        migrations.RunPython(backfill_org_admin, reverse_code=migrations.RunPython.noop),
    ]
