"""Tests for Ticket API SLA integration (MED-218)."""

import pytest
from datetime import timedelta
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from csm.models import Queue, Ticket, SLAPolicy, SLAPriorityTarget

pytestmark = pytest.mark.django_db


def _list_url(**params):
    url = reverse('ticket-list')
    if params:
        url += '?' + '&'.join(f'{k}={v}' for k, v in params.items())
    return url


def _detail_url(pk):
    return reverse('ticket-detail', kwargs={'pk': pk})


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def csm_admin_user(user, customer_organisation):
    from csm.models import CustomerUser
    CustomerUser.objects.get_or_create(
        user=user,
        organisation=customer_organisation,
        defaults={'user_type': 'admin', 'is_active': True},
    )
    return user


@pytest.fixture
def agent_client(api_client, csm_admin_user):
    api_client.force_authenticate(user=csm_admin_user)
    return api_client


@pytest.fixture
def queue(project, customer_organisation):
    return Queue.objects.create(
        project=project,
        organisation=customer_organisation,
        name='Test Queue',
        tier='T1',
    )


@pytest.fixture
def ticket(queue):
    return Ticket.objects.create(queue=queue, title='Test Ticket', priority='medium')


@pytest.fixture
def full_sla_policy(project):
    policy = SLAPolicy.objects.create(project=project, name='SLA')
    for priority, fr, res in [
        ('critical', 60, 240),
        ('high', 240, 480),
        ('medium', 480, 1440),
        ('low', 1440, 2880),
    ]:
        SLAPriorityTarget.objects.create(
            policy=policy, priority=priority,
            first_response_minutes=fr, resolution_minutes=res,
        )
    return policy


# ---------------------------------------------------------------------------
# Serializer — SLA fields present in response
# ---------------------------------------------------------------------------

class TestTicketSerializerSlaFields:
    def test_ticket_response_has_sla_fields(self, agent_client, ticket):
        response = agent_client.get(_detail_url(ticket.id))
        assert response.status_code == status.HTTP_200_OK
        assert 'first_response_due' in response.data
        assert 'resolution_due' in response.data
        assert 'sla' in response.data

    def test_sla_field_has_required_keys(self, agent_client, ticket):
        response = agent_client.get(_detail_url(ticket.id))
        sla = response.data['sla']
        assert 'first_response_due' in sla
        assert 'resolution_due' in sla
        assert 'first_response_breached' in sla
        assert 'resolution_breached' in sla
        assert 'first_response_remaining_seconds' in sla
        assert 'resolution_remaining_seconds' in sla

    def test_sla_field_null_when_no_policy(self, agent_client, ticket):
        response = agent_client.get(_detail_url(ticket.id))
        sla = response.data['sla']
        assert sla['first_response_due'] is None
        assert sla['resolution_due'] is None
        assert sla['first_response_breached'] is False
        assert sla['resolution_breached'] is False


# ---------------------------------------------------------------------------
# SLA recalculation on ticket create
# ---------------------------------------------------------------------------

class TestTicketCreateSla:
    def test_create_ticket_sets_sla_when_policy_exists(
        self, agent_client, queue, full_sla_policy
    ):
        response = agent_client.post(
            _list_url(),
            {'queue': queue.id, 'title': 'New Ticket', 'priority': 'critical'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['first_response_due'] is not None
        assert response.data['resolution_due'] is not None

    def test_create_ticket_no_policy_leaves_sla_null(self, agent_client, queue):
        response = agent_client.post(
            _list_url(),
            {'queue': queue.id, 'title': 'New Ticket', 'priority': 'medium'},
            format='json',
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['first_response_due'] is None
        assert response.data['resolution_due'] is None

    def test_critical_sla_shorter_than_medium(self, agent_client, queue, full_sla_policy):
        r1 = agent_client.post(
            _list_url(),
            {'queue': queue.id, 'title': 'Critical', 'priority': 'critical'},
            format='json',
        )
        r2 = agent_client.post(
            _list_url(),
            {'queue': queue.id, 'title': 'Medium', 'priority': 'medium'},
            format='json',
        )
        from datetime import datetime
        import dateutil.parser
        critical_fr = dateutil.parser.parse(r1.data['first_response_due'])
        medium_fr = dateutil.parser.parse(r2.data['first_response_due'])
        assert critical_fr < medium_fr


# ---------------------------------------------------------------------------
# SLA recalculation on priority change
# ---------------------------------------------------------------------------

class TestTicketPriorityChangeSla:
    def test_changing_priority_updates_sla_dues(
        self, agent_client, ticket, full_sla_policy
    ):
        response = agent_client.patch(
            _detail_url(ticket.id),
            {'priority': 'critical'},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['priority'] == 'critical'
        assert response.data['first_response_due'] is not None
        ticket.refresh_from_db()
        assert ticket.first_response_due is not None

    def test_changing_to_lower_priority_extends_sla(
        self, agent_client, ticket, full_sla_policy
    ):
        # First set to critical
        agent_client.patch(_detail_url(ticket.id), {'priority': 'critical'}, format='json')
        ticket.refresh_from_db()
        critical_fr = ticket.first_response_due

        # Then downgrade to low
        agent_client.patch(_detail_url(ticket.id), {'priority': 'low'}, format='json')
        ticket.refresh_from_db()
        low_fr = ticket.first_response_due

        assert low_fr > critical_fr

    def test_priority_change_without_policy_clears_sla(
        self, agent_client, ticket
    ):
        # Manually set SLA dues
        ticket.first_response_due = timezone.now() + timedelta(hours=4)
        ticket.resolution_due = timezone.now() + timedelta(hours=24)
        ticket.save()

        # Change priority — no policy exists → should clear dues
        response = agent_client.patch(
            _detail_url(ticket.id),
            {'priority': 'high'},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['first_response_due'] is None
        assert response.data['resolution_due'] is None

    def test_patch_without_priority_change_preserves_sla(
        self, agent_client, ticket, full_sla_policy
    ):
        # Set initial SLA via priority change
        agent_client.patch(_detail_url(ticket.id), {'priority': 'high'}, format='json')
        ticket.refresh_from_db()
        original_fr = ticket.first_response_due
        assert original_fr is not None

        # Update title only — SLA should be unchanged
        agent_client.patch(_detail_url(ticket.id), {'title': 'Updated title'}, format='json')
        ticket.refresh_from_db()
        assert ticket.first_response_due == original_fr


# ---------------------------------------------------------------------------
# Priority ordering
# ---------------------------------------------------------------------------

def _results(response):
    """Extract ticket list from paginated or plain response."""
    data = response.data
    if isinstance(data, dict) and 'results' in data:
        return data['results']
    return data


class TestTicketPriorityOrdering:
    def test_ordering_by_priority_critical_first(self, agent_client, queue):
        t_low      = Ticket.objects.create(queue=queue, title='Low',      priority='low')
        t_critical = Ticket.objects.create(queue=queue, title='Critical', priority='critical')
        t_medium   = Ticket.objects.create(queue=queue, title='Medium',   priority='medium')
        t_high     = Ticket.objects.create(queue=queue, title='High',     priority='high')

        # Verify DB IDs and timestamps
        print(f'\nTicket IDs: low={t_low.id} critical={t_critical.id} medium={t_medium.id} high={t_high.id}')
        print(f'Timestamps: low={t_low.created_at} critical={t_critical.created_at} medium={t_medium.created_at} high={t_high.created_at}')

        response = agent_client.get(_list_url(ordering='priority', queue=queue.id))
        assert response.status_code == status.HTTP_200_OK
        results = _results(response)
        priorities = [t['priority'] for t in results]
        print(f'API result: {priorities}')
        assert priorities[0] == 'critical'
        assert priorities[1] == 'high'
        assert priorities[2] == 'medium'
        assert priorities[3] == 'low'

    def test_ordering_by_minus_priority_low_first(self, agent_client, queue):
        Ticket.objects.create(queue=queue, title='Critical', priority='critical')
        Ticket.objects.create(queue=queue, title='Low',      priority='low')

        response = agent_client.get(_list_url(ordering='-priority'))
        assert response.status_code == status.HTTP_200_OK
        priorities = [t['priority'] for t in _results(response)]
        assert priorities[0] == 'low'
        assert priorities[-1] == 'critical'

    def test_default_ordering_is_newest_first(self, agent_client, queue):
        Ticket.objects.create(queue=queue, title='First',  priority='low')
        Ticket.objects.create(queue=queue, title='Second', priority='critical')

        response = agent_client.get(_list_url())
        assert response.status_code == status.HTTP_200_OK
        titles = [t['title'] for t in _results(response)]
        assert titles[0] == 'Second'
