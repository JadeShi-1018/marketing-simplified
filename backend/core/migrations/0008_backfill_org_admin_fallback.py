from django.db import migrations


def backfill_org_admin_fallback(apps, schema_editor):
    """
    Fallback for orgs that have real users but no CustomerUser.is_creator record —
    e.g. orgs registered via RegisterView *before* the CustomerUser creation block
    was added to that view (commit 74e267408, 2026-05-28).

    For each such org:
      - Skip if it already has an Organization Admin (covered by migration 0007 or
        the code-level fix).
      - Grant admin to the earliest-joined active user (best proxy for the creator
        when no is_creator record exists).
      - Skip orgs with zero users (shell/test data — no safe creator to infer).

    Why "earliest date_joined" is structurally equivalent to the org creator
    (not a heuristic guess):
    ─────────────────────────────────────────────────────────────────────────
    1. RegisterView creates org + user in the same request (same DB transaction).
       The registering user is therefore always the first and only member when
       the org is born.

    2. The only way other users can join an existing org is via
       invite_users_to_organization, which requires the caller to already hold
       an Organization Admin role (IsOrganizationAdmin permission check).
       No admin exists until the creator is bootstrapped → no one else can be
       invited until after the creator exists.

    3. Therefore any user whose date_joined is later than the earliest one was
       necessarily invited *after* the org was created, and the earliest active
       user is definitionally the creator.

    The sole edge case that could produce a wrong assignment: the original
    creator hard-deleted or deactivated their account, leaving an invited user
    as the earliest *active* member. Even then, granting admin to the active
    manager is the correct operational outcome (and better than leaving the org
    with zero admins). This case is also extremely rare in practice.
    """
    Organization = apps.get_model('core', 'Organization')
    CustomUser = apps.get_model('core', 'CustomUser')
    CustomerUser = apps.get_model('csm', 'CustomerUser')
    Role = apps.get_model('core', 'Role')
    UserRole = apps.get_model('access_control', 'UserRole')

    for org in Organization.objects.filter(is_deleted=False):
        # Skip if org already has an Organization Admin
        if UserRole.objects.filter(role__organization=org, role__level=2).exists():
            continue

        # Skip if there is already a CustomerUser.is_creator for this org
        # (those were handled by migration 0007)
        if CustomerUser.objects.filter(
            is_creator=True,
            organisation__isnull=False,
            organisation__organization=org,
        ).exists():
            continue

        # Find earliest active user in this org as the creator proxy
        earliest_user = (
            CustomUser.objects
            .filter(organization=org, is_active=True)
            .order_by('date_joined')
            .first()
        )
        if not earliest_user:
            continue

        admin_role, _ = Role.objects.get_or_create(
            organization=org,
            name='Organization Admin',
            defaults={'level': 2},
        )
        UserRole.objects.get_or_create(user=earliest_user, role=admin_role)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0007_backfill_org_admin'),
        ('access_control', '0002_initial'),
        ('csm', '0005_csm_notification_and_is_creator'),
    ]

    operations = [
        migrations.RunPython(
            backfill_org_admin_fallback,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
