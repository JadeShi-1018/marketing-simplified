from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils import timezone
from datetime import timedelta

from core.test_utils import TenantTestCase
from access_control.models import RolePermission, UserRole

class ModelConstraintTest(TenantTestCase):
    def test_permission_unique(self):
        from core.models import Organization, Team, Role, Permission
        # (module, action) must be unique
        Permission.objects.get_or_create(module="ASSET", action="VIEW")
        with self.assertRaises(IntegrityError):
            Permission.objects.create(module="ASSET", action="VIEW")

    def test_rolepermission_unique(self):
        from core.models import Role, Permission
        # Use the test organization created by TenantTestCase
        perm, _ = Permission.objects.get_or_create(module="CAMPAIGN", action="EDIT")
        role = Role.objects.create(organization_id=self.test_org.id, name="Editor", level=1)
        RolePermission.objects.create(role=role, permission=perm)
        with self.assertRaises(IntegrityError):
            RolePermission.objects.create(role=role, permission=perm)

    def test_userrole_unique_with_team(self):
        from core.models import Team, Role
        # Use helper method to create user in public schema
        user = self.create_user(username="u1", email="u1@example.com", password="pw")
        # Use the test organization created by TenantTestCase
        role = Role.objects.create(organization_id=self.test_org.id, name="Member", level=1)
        team = Team.objects.create(organization_id=self.test_org.id, name="TeamA")
        UserRole.objects.create(user=user, role=role, team=team, valid_from=timezone.now())
        with self.assertRaises(IntegrityError):
            UserRole.objects.create(user=user, role=role, team=team, valid_from=timezone.now())

    def test_userrole_nullable_team_allows_multiple(self):
        from core.models import Role
        # Use helper method to create user in public schema
        user = self.create_user(username="u2", email="u2@example.com", password="pw")
        # Use the test organization created by TenantTestCase
        role = Role.objects.create(organization_id=self.test_org.id, name="Analyst", level=1)

        # first record without valid_to
        UserRole.objects.create(user=user, role=role, team=None, valid_from=timezone.now())

        # second record with a different valid_to
        UserRole.objects.create(
            user=user,
            role=role,
            team=None,
            valid_from=timezone.now(),
            valid_to=timezone.now() + timedelta(days=1)
        )
