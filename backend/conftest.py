"""Shared backend test fixtures for CSM and experience_group tests."""

import os

import django
import pytest
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
if not settings.configured:
    django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Organization, Project, ProjectMember
from csm.models import Queue, SupportProject, CsmWorkType

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def organization():
    return Organization.objects.create(
        name='Test Organization',
        email_domain='test.com',
    )


@pytest.fixture
def user(organization):
    return User.objects.create_user(
        username='testuser',
        email='testuser@test.com',
        password='testpass123',
        organization=organization,
    )


@pytest.fixture
def user2(organization):
    return User.objects.create_user(
        username='testuser2',
        email='testuser2@test.com',
        password='testpass123',
        organization=organization,
    )


@pytest.fixture
def project(organization, user):
    proj = Project.objects.create(
        name='Test Project',
        organization=organization,
        owner=user,
        objectives=['awareness'],
        kpis={'ctr': {'target': 0.02}},
    )
    ProjectMember.objects.create(
        user=user,
        project=proj,
        role='owner',
        is_active=True,
    )
    return proj


@pytest.fixture
def customer_organisation(organization):
    from customer.models import CustomerOrganisation
    return CustomerOrganisation.objects.create(
        name='Test Org',
        organization=organization,
    )


@pytest.fixture
def csm_queue(project, customer_organisation):
    return Queue.objects.create(
        project=project,
        organisation=customer_organisation,
        name='Frontline',
        tier='T1',
        display_order=0,
        is_active=True,
    )


@pytest.fixture
def support_project(project, csm_queue):
    return SupportProject.objects.create(
        project=project,
        name='Billing',
        default_queue=csm_queue,
    )


@pytest.fixture
def archived_support_project(project):
    return SupportProject.objects.create(
        project=project,
        name='Legacy',
        is_archived=True,
    )


@pytest.fixture
def work_type(project):
    return CsmWorkType.objects.create(
        project=project,
        name='Incident',
        sort_order=0,
        is_active=True,
    )


@pytest.fixture
def inactive_work_type(project):
    return CsmWorkType.objects.create(
        project=project,
        name='Retired',
        sort_order=99,
        is_active=False,
    )


@pytest.fixture
def experience_group(project):
    from experience_group.models import ExperienceGroup
    return ExperienceGroup.objects.create(project=project, name='VIP Support')


@pytest.fixture
def default_form(project, user):
    from csm.models import TicketForm
    from csm.services import ensure_system_fields
    form = TicketForm.objects.create(
        project=project, name='Default', is_default=True, created_by=user,
    )
    ensure_system_fields(form)
    return form


@pytest.fixture
def member_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def outsider_client(api_client, user2):
    api_client.force_authenticate(user=user2)
    return api_client


@pytest.fixture
def portal_user(organization):
    return User.objects.create_user(
        username='portal@test.com',
        email='portal@test.com',
        password='testpass123',
        organization=organization,
    )


@pytest.fixture
def customer(portal_user, customer_organisation, project):
    from customer.models import Customer
    return Customer.objects.create(
        user=portal_user,
        email='portal@test.com',
        full_name='Portal User',
        organisation=customer_organisation,
        project=project,
    )


@pytest.fixture
def portal_customer_client(api_client, portal_user):
    api_client.force_authenticate(user=portal_user)
    return api_client


@pytest.fixture
def published_experience_group(experience_group):
    experience_group.publish()
    experience_group.save()
    return experience_group
