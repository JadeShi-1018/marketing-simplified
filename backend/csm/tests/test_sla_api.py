"""Tests for SLA Policy API (MED-218)."""

import pytest
from datetime import timedelta
from django.utils import timezone
from django.urls import reverse
from rest_framework import status

from csm.models import SLAPolicy, SLAPriorityTarget, Ticket
from csm.services.sla import recalculate_ticket_sla, get_sla_status

pytestmark = pytest.mark.django_db


def _list_url(project_id):
    return reverse('sla-policy-list') + f'?project={project_id}'


def _detail_url(pk):
    return reverse('sla-policy-detail', kwargs={'pk': pk})


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def csm_admin_client(api_client, user, customer_organisation):
    """An API client authenticated as a CSM admin user."""
    from csm.models import CustomerUser
    CustomerUser.objects.get_or_create(
        user=user,
        organisation=customer_organisation,
        defaults={'user_type': 'admin', 'is_active': True},
    )
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def non_admin_client(api_client, user2):
    """Authenticated client whose user has no CSM CustomerUser record."""
    api_client.force_authenticate(user=user2)
    return api_client


@pytest.fixture
def sla_policy_with_targets(project):
    policy = SLAPolicy.objects.create(project=project, name='Test SLA')
    targets = [
        ('critical', 60,   240),
        ('high',     240,  480),
        ('medium',   480,  1440),
        ('low',      1440, 2880),
    ]
    for priority, fr, res in targets:
        SLAPriorityTarget.objects.create(
            policy=policy, priority=priority,
            first_response_minutes=fr, resolution_minutes=res,
        )
    return policy


# ---------------------------------------------------------------------------
# GET — auto-create + retrieve
# ---------------------------------------------------------------------------

class TestSLAPolicyGet:
    def test_returns_200_for_admin(self, csm_admin_client, project):
        response = csm_admin_client.get(_list_url(project.id))
        assert response.status_code == status.HTTP_200_OK

    def test_auto_creates_policy_if_absent(self, csm_admin_client, project):
        assert not SLAPolicy.objects.filter(project=project).exists()
        csm_admin_client.get(_list_url(project.id))
        assert SLAPolicy.objects.filter(project=project).exists()

    def test_auto_creates_four_default_targets(self, csm_admin_client, project):
        csm_admin_client.get(_list_url(project.id))
        policy = SLAPolicy.objects.get(project=project)
        assert policy.priority_targets.count() == 4

    def test_returns_policy_fields(self, csm_admin_client, project, sla_policy_with_targets):
        response = csm_admin_client.get(_list_url(project.id))
        data = response.data
        assert data['id'] == sla_policy_with_targets.id
        assert data['name'] == 'Test SLA'
        assert data['is_active'] is True
        assert len(data['priority_targets']) == 4

    def test_targets_have_correct_fields(self, csm_admin_client, project, sla_policy_with_targets):
        response = csm_admin_client.get(_list_url(project.id))
        target = response.data['priority_targets'][0]
        assert 'priority' in target
        assert 'first_response_minutes' in target
        assert 'resolution_minutes' in target

    def test_non_admin_gets_403(self, non_admin_client, project):
        response = non_admin_client.get(_list_url(project.id))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_missing_project_param_returns_400(self, csm_admin_client):
        url = reverse('sla-policy-list')
        response = csm_admin_client.get(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_second_get_does_not_duplicate_policy(self, csm_admin_client, project):
        csm_admin_client.get(_list_url(project.id))
        csm_admin_client.get(_list_url(project.id))
        assert SLAPolicy.objects.filter(project=project).count() == 1

    def test_second_get_does_not_duplicate_targets(self, csm_admin_client, project):
        csm_admin_client.get(_list_url(project.id))
        csm_admin_client.get(_list_url(project.id))
        policy = SLAPolicy.objects.get(project=project)
        assert policy.priority_targets.count() == 4


# ---------------------------------------------------------------------------
# PATCH — partial update
# ---------------------------------------------------------------------------

class TestSLAPolicyPatch:
    def test_patch_updates_policy_name(self, csm_admin_client, project, sla_policy_with_targets):
        response = csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'name': 'Updated SLA'},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Updated SLA'
        sla_policy_with_targets.refresh_from_db()
        assert sla_policy_with_targets.name == 'Updated SLA'

    def test_patch_is_active_deactivates_policy(self, csm_admin_client, project, sla_policy_with_targets):
        response = csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'is_active': False},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_active'] is False

    def test_patch_replaces_priority_targets(self, csm_admin_client, project, sla_policy_with_targets):
        new_targets = [
            {'priority': 'critical', 'first_response_minutes': 30, 'resolution_minutes': 120},
            {'priority': 'high',     'first_response_minutes': 120, 'resolution_minutes': 360},
        ]
        response = csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'priority_targets': new_targets},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['priority_targets']) == 2
        sla_policy_with_targets.refresh_from_db()
        assert sla_policy_with_targets.priority_targets.count() == 2

    def test_patch_without_targets_preserves_existing_targets(
        self, csm_admin_client, project, sla_policy_with_targets
    ):
        response = csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'name': 'New name'},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['priority_targets']) == 4

    def test_patch_non_admin_gets_403(self, non_admin_client, project, sla_policy_with_targets):
        response = non_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'name': 'Hack'},
            format='json',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


# ---------------------------------------------------------------------------
# PUT — full update
# ---------------------------------------------------------------------------

class TestSLAPolicyPut:
    def test_put_replaces_all_targets(self, csm_admin_client, project, sla_policy_with_targets):
        payload = {
            'name': 'Strict SLA',
            'is_active': True,
            'priority_targets': [
                {'priority': 'critical', 'first_response_minutes': 15, 'resolution_minutes': 60},
                {'priority': 'high',     'first_response_minutes': 60, 'resolution_minutes': 240},
                {'priority': 'medium',   'first_response_minutes': 240, 'resolution_minutes': 720},
                {'priority': 'low',      'first_response_minutes': 480, 'resolution_minutes': 1440},
            ],
        }
        response = csm_admin_client.put(
            _detail_url(sla_policy_with_targets.id),
            payload,
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Strict SLA'
        assert len(response.data['priority_targets']) == 4
        critical = next(t for t in response.data['priority_targets'] if t['priority'] == 'critical')
        assert critical['first_response_minutes'] == 15

    def test_put_non_admin_gets_403(self, non_admin_client, project, sla_policy_with_targets):
        response = non_admin_client.put(
            _detail_url(sla_policy_with_targets.id),
            {'name': 'Hack', 'is_active': True},
            format='json',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


# ---------------------------------------------------------------------------
# Policy update → open ticket SLA sync (MED-218)
# ---------------------------------------------------------------------------

class TestSLAPolicyTicketSync:
    """Updating policy targets or is_active must retroactively sync open tickets."""

    @pytest.fixture
    def open_ticket(self, csm_queue, sla_policy_with_targets):
        """A todo ticket whose SLA was set under the original policy."""
        ticket = Ticket.objects.create(
            queue=csm_queue,
            title='Open ticket',
            status='todo',
            priority='medium',
        )
        from csm.services.sla import recalculate_ticket_sla
        recalculate_ticket_sla(ticket)
        ticket.save(update_fields=['first_response_due', 'resolution_due'])
        return ticket

    @pytest.fixture
    def resolved_ticket(self, csm_queue, sla_policy_with_targets):
        """A resolved ticket — its SLA deadlines must not be touched."""
        ticket = Ticket.objects.create(
            queue=csm_queue,
            title='Resolved ticket',
            status='resolved',
            priority='medium',
        )
        from csm.services.sla import recalculate_ticket_sla
        recalculate_ticket_sla(ticket)
        ticket.save(update_fields=['first_response_due', 'resolution_due'])
        return ticket

    def test_patch_targets_recalculates_open_ticket_sla(
        self, csm_admin_client, sla_policy_with_targets, open_ticket
    ):
        old_fr = open_ticket.first_response_due
        # Halve the medium first_response target: 480 → 60 minutes
        csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'priority_targets': [
                {'priority': 'medium', 'first_response_minutes': 60, 'resolution_minutes': 240},
            ]},
            format='json',
        )
        open_ticket.refresh_from_db()
        assert open_ticket.first_response_due is not None
        assert open_ticket.first_response_due != old_fr

    def test_deactivating_policy_preserves_dues_but_reads_no_sla(
        self, csm_admin_client, sla_policy_with_targets, open_ticket
    ):
        # Model B: deactivating is non-destructive. The stored deadlines stay on
        # the ticket, but get_sla_status reads them as no-SLA while tracking is off.
        assert open_ticket.first_response_due is not None
        csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'is_active': False},
            format='json',
        )
        open_ticket.refresh_from_db()
        assert open_ticket.first_response_due is not None
        assert open_ticket.resolution_due is not None
        status_data = get_sla_status(open_ticket)
        assert status_data['first_response_remaining_seconds'] is None
        assert status_data['resolution_remaining_seconds'] is None
        assert status_data['first_response_state'] is None

    def test_reactivating_policy_resumes_same_dues(
        self, csm_admin_client, sla_policy_with_targets, open_ticket
    ):
        original_fr = open_ticket.first_response_due
        original_res = open_ticket.resolution_due

        csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'is_active': False}, format='json',
        )
        csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'is_active': True}, format='json',
        )
        open_ticket.refresh_from_db()
        # Anchor preserved across the off/on cycle — no restart-from-now.
        assert open_ticket.first_response_due == original_fr
        assert open_ticket.resolution_due == original_res
        status_data = get_sla_status(open_ticket)
        assert status_data['first_response_remaining_seconds'] > 0

    def test_reactivate_with_target_change_does_not_mark_old_tickets_overdue(
        self, csm_admin_client, sla_policy_with_targets, csm_queue,
    ):
        ticket = Ticket.objects.create(
            queue=csm_queue,
            title='Old open ticket',
            status='todo',
            priority='high',
        )
        recalculate_ticket_sla(ticket)
        ticket.save(update_fields=['first_response_due', 'resolution_due'])

        csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'is_active': False},
            format='json',
        )
        ticket.refresh_from_db()
        # Model B: deactivating preserves the stored deadline.
        assert ticket.first_response_due is not None

        csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {
                'is_active': True,
                'priority_targets': [
                    {'priority': 'critical', 'first_response_minutes': 60, 'resolution_minutes': 240},
                    {'priority': 'high', 'first_response_minutes': 300, 'resolution_minutes': 480},
                    {'priority': 'medium', 'first_response_minutes': 480, 'resolution_minutes': 1440},
                    {'priority': 'low', 'first_response_minutes': 1440, 'resolution_minutes': 2880},
                ],
            },
            format='json',
        )
        ticket.refresh_from_db()
        status_data = get_sla_status(ticket)
        assert status_data['first_response_breached'] is False
        assert status_data['first_response_remaining_seconds'] > 0

    def test_resolved_ticket_sla_not_touched_on_policy_update(
        self, csm_admin_client, sla_policy_with_targets, resolved_ticket
    ):
        original_fr = resolved_ticket.first_response_due
        csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'priority_targets': [
                {'priority': 'medium', 'first_response_minutes': 10, 'resolution_minutes': 20},
            ]},
            format='json',
        )
        resolved_ticket.refresh_from_db()
        assert resolved_ticket.first_response_due == original_fr

    def test_policy_update_preserves_priority_change_anchor(
        self, csm_admin_client, sla_policy_with_targets, csm_queue,
    ):
        """Critical ticket after priority change must not flip to overdue on policy save."""
        anchor = timezone.now()
        ticket = Ticket.objects.create(
            queue=csm_queue,
            title='Recently escalated',
            status='todo',
            priority='critical',
        )
        recalculate_ticket_sla(ticket, base_time=anchor)
        ticket.save(update_fields=['first_response_due', 'resolution_due'])

        all_targets = [
            {'priority': 'critical', 'first_response_minutes': 200, 'resolution_minutes': 240},
            {'priority': 'high', 'first_response_minutes': 240, 'resolution_minutes': 480},
            {'priority': 'medium', 'first_response_minutes': 480, 'resolution_minutes': 1440},
            {'priority': 'low', 'first_response_minutes': 1440, 'resolution_minutes': 2880},
        ]
        csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'priority_targets': all_targets},
            format='json',
        )
        ticket.refresh_from_db()

        expected_fr = anchor + timedelta(minutes=200)
        assert abs((ticket.first_response_due - expected_fr).total_seconds()) < 5
        status_data = get_sla_status(ticket)
        assert status_data['first_response_breached'] is False
        assert status_data['first_response_remaining_seconds'] > 0

    def test_policy_update_does_not_change_unaffected_priority_dues(
        self, csm_admin_client, sla_policy_with_targets, csm_queue,
    ):
        high_ticket = Ticket.objects.create(
            queue=csm_queue,
            title='High ticket',
            status='todo',
            priority='high',
        )
        recalculate_ticket_sla(high_ticket)
        high_ticket.save(update_fields=['first_response_due', 'resolution_due'])
        old_fr = high_ticket.first_response_due
        old_res = high_ticket.resolution_due

        csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'priority_targets': [
                {'priority': 'critical', 'first_response_minutes': 200, 'resolution_minutes': 240},
                {'priority': 'high', 'first_response_minutes': 240, 'resolution_minutes': 480},
                {'priority': 'medium', 'first_response_minutes': 480, 'resolution_minutes': 1440},
                {'priority': 'low', 'first_response_minutes': 1440, 'resolution_minutes': 2880},
            ]},
            format='json',
        )
        high_ticket.refresh_from_db()
        assert high_ticket.first_response_due == old_fr
        assert high_ticket.resolution_due == old_res


# ---------------------------------------------------------------------------
# Business Hours Calendar API
# ---------------------------------------------------------------------------

def _calendars_url(project_id):
    return reverse('business-hours-calendar-list') + f'?project={project_id}'


class TestBusinessHoursCalendarAPI:
    def test_create_scopes_to_project(self, csm_admin_client, project):
        resp = csm_admin_client.post(
            _calendars_url(project.id),
            {'name': 'Standard 9-5', 'timezone': 'Europe/London'},
            format='json',
        )
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['project'] == project.id
        assert resp.data['name'] == 'Standard 9-5'
        # Default schedule is seeded when none is supplied.
        assert resp.data['schedule']['monday']['enabled'] is True

    def test_list_returns_project_calendars(self, csm_admin_client, project):
        from csm.models import BusinessHoursCalendar
        BusinessHoursCalendar.objects.create(project=project, name='A')
        BusinessHoursCalendar.objects.create(project=project, name='B')
        resp = csm_admin_client.get(_calendars_url(project.id))
        assert resp.status_code == status.HTTP_200_OK
        names = {c['name'] for c in (resp.data if isinstance(resp.data, list) else resp.data['results'])}
        assert names == {'A', 'B'}

    def test_attach_calendar_to_policy(self, csm_admin_client, project, sla_policy_with_targets):
        from csm.models import BusinessHoursCalendar
        cal = BusinessHoursCalendar.objects.create(project=project, name='Cal')
        resp = csm_admin_client.patch(
            _detail_url(sla_policy_with_targets.id),
            {'calendar': cal.id, 'pause_on_pending': False},
            format='json',
        )
        assert resp.status_code == status.HTTP_200_OK
        sla_policy_with_targets.refresh_from_db()
        assert sla_policy_with_targets.calendar_id == cal.id
        assert sla_policy_with_targets.pause_on_pending is False
