"""Centralized helpers for admin role checks."""


def is_org_admin(user):
    """Return True if the user holds an Organization Admin role (level 2) in their org."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    org = getattr(user, 'organization', None)
    if not org:
        return False
    from access_control.models import UserRole
    return UserRole.objects.filter(
        user=user,
        role__organization=org,
        role__level=2,
    ).exists()


def get_org_admin_org_ids(user):
    """Return a list of org IDs where the user is an org admin."""
    if not user or not getattr(user, 'is_authenticated', False):
        return []
    org = getattr(user, 'organization', None)
    if not org:
        return []
    from access_control.models import UserRole
    if UserRole.objects.filter(
        user=user,
        role__organization=org,
        role__level=2,
    ).exists():
        return [org.id]
    return []


def get_csm_admin_org_ids(user):
    """Return CustomerOrganisation IDs where user is a CSM admin."""
    if not user or not getattr(user, 'is_authenticated', False):
        return []
    from csm.models import CustomerUser
    return list(
        CustomerUser.objects.filter(
            user=user, user_type='admin', is_active=True,
            organisation__isnull=False,
        ).values_list('organisation_id', flat=True).distinct()
    )


def is_csm_admin(user):
    """Return True if user is a CSM admin for at least one org."""
    return len(get_csm_admin_org_ids(user)) > 0
