"""Shared pytest fixtures for chat app tests."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Organization, Project, ProjectMember, Team, TeamMember
from chat.models import Chat, ChatParticipant, ChatType

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
