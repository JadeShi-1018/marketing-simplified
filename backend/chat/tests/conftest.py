"""Shared pytest fixtures for chat app tests."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Organization, Project, ProjectMember, Team, TeamMember
from chat.models import Chat, ChatParticipant, ChatType


@pytest.fixture(autouse=True)
def _drop_tenant_schemas_before_flush(request, db):
    """Drop org_* schemas created by THIS test before pytest-django's teardown.

    Tests marked @pytest.mark.django_db(transaction=True) that create
    Organization objects trigger provision_tenant_schema(), which creates an
    org_<slug> schema containing a core_role table with a FK to
    public.core_organization.

    pytest-django's _django_db_helper creates its own PytestDjangoTestCase
    and calls _post_teardown() directly — our transactional_db override is
    bypassed.  That teardown runs TRUNCATE with allow_cascade=False.  The
    cross-schema FK causes FeatureNotSupported.

    Fix: record existing schemas BEFORE the test, then in teardown only DROP
    schemas that are NEW (created by this test).  Dropping only new schemas
    avoids killing tenant data that other xdist workers are still using.
    """
    from django.db import connection

    def _current_schemas():
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name LIKE %(pat)s ESCAPE %(esc)s",
                {"pat": "org\\_%%", "esc": "\\"},
            )
            return {row[0] for row in cursor.fetchall()}

    # Snapshot schemas that existed before this test ran.
    schemas_before = _current_schemas()

    yield

    # Only transactional tests commit real tenant data; skip for others.
    marker = request.node.get_closest_marker("django_db")
    if not (marker and marker.kwargs.get("transaction", False)):
        return

    # Only drop schemas that were created by THIS test run.
    schemas_after = _current_schemas()
    new_schemas = schemas_after - schemas_before

    for schema in new_schemas:
        safe = schema.replace('"', '""')
        with connection.cursor() as cursor:
            cursor.execute(f'DROP SCHEMA IF EXISTS "{safe}" CASCADE')

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
