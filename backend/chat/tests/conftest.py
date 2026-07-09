"""Shared pytest fixtures for chat app tests."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Organization, Project, ProjectMember, Team, TeamMember
from chat.models import Chat, ChatParticipant, ChatType


@pytest.fixture()
def transactional_db(request, django_db_setup, django_db_blocker):
    """Override transactional_db to flush with tenant schema cleanup.

    Tests in this package may create Organization objects which trigger
    provision_tenant_schema(), producing cross-schema FK constraints
    (e.g. org_<slug>.core_project -> public.core_customuser). Django flush
    command generates TRUNCATE for all tables in search_path=public, but
    tenant tables only exist in org_* schemas, causing CommandError.

    Fix: drop all org_* schemas first (removing cross-schema FK refs),
    then run the standard flush on the public schema without cascade.
    """
    from django.test import TransactionTestCase

    class _CascadeTC(TransactionTestCase):
        def _fixture_teardown(self):
            from django.db import connection
            from django.core.management import call_command

            # Drop all tenant schemas first so cross-schema FK references
            # (e.g. org_<slug>.core_project -> public.core_customuser) are
            # removed before Django flush tries to TRUNCATE public tables.
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT schema_name FROM information_schema.schemata "
                    "WHERE schema_name LIKE %(pat)s ESCAPE %(esc)s",
                    {"pat": "org\_%%", "esc": "\\"},
                )
                schemas = [row[0] for row in cursor.fetchall()]
            for schema in schemas:
                safe = schema.replace('"', '""')
                with connection.cursor() as cursor:
                    cursor.execute(f'DROP SCHEMA IF EXISTS "{safe}" CASCADE')

            # Standard flush for public-schema tables (no cascade needed)
            for db_name in self._databases_names(include_mirrors=False):
                call_command(
                    'flush',
                    verbosity=0,
                    interactive=False,
                    database=db_name,
                    reset_sequences=False,
                    allow_cascade=False,
                    inhibit_post_migrate=True,
                )

    with django_db_blocker.unblock():
        tc = _CascadeTC('runTest')
        tc._pre_setup()
        yield
        tc._post_teardown()

User = get_user_model()


@pytest.fixture
def user3(organization):
    return User.objects.create_user(
        email='user3@example.com',
        username='user3',
        password='testpass123',
        organization=organization,
    )


@pytest.fixture
def chat_organization(db):
    return Organization.objects.create(name='Test Organization')


@pytest.fixture
def chat_team(chat_organization):
    return Team.objects.create(
        organization=chat_organization,
        name='Test Team',
    )


@pytest.fixture
def chat_project(chat_organization):
    return Project.objects.create(
        name='Test Project',
        organization=chat_organization,
    )


@pytest.fixture
def chat_user1(db):
    return User.objects.create_user(
        email='user1@example.com',
        username='user1',
        password='testpass123',
    )


@pytest.fixture
def chat_user2(db):
    return User.objects.create_user(
        email='user2@example.com',
        username='user2',
        password='testpass123',
    )


@pytest.fixture
def user2_in_project(user2, project):
    ProjectMember.objects.create(
        user=user2,
        project=project,
        role='member',
        is_active=True,
    )
    return user2


@pytest.fixture
def capture_on_commit_callbacks(django_capture_on_commit_callbacks):
    return django_capture_on_commit_callbacks
