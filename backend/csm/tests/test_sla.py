"""Tests for ticket priority model changes and SLA calculation service (MED-218)."""

import pytest
from datetime import timedelta
from django.utils import timezone

from csm.models import Queue, Ticket, SLAPolicy, SLAPriorityTarget
from csm.services.sla import (
    recalculate_ticket_sla,
    recalculate_ticket_sla_after_policy_change,
    get_sla_status,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def queue(project, customer_organisation):
    return Queue.objects.create(
        project=project,
        organisation=customer_organisation,
        name='Support Queue',
        tier='T1',
    )


@pytest.fixture
def ticket(queue):
    return Ticket.objects.create(
        queue=queue,
        title='Test Ticket',
        priority='medium',
    )


@pytest.fixture
def sla_policy(project):
    return SLAPolicy.objects.create(project=project, name='Default SLA')


@pytest.fixture
def full_sla_policy(sla_policy):
    """SLAPolicy with targets for all four priority levels."""
    targets = [
        ('critical', 60,   240),   # 1h first response, 4h resolution
        ('high',     240,  480),   # 4h / 8h
        ('medium',   480,  1440),  # 8h / 24h
        ('low',      1440, 2880),  # 24h / 48h
    ]
    for priority, fr, res in targets:
        SLAPriorityTarget.objects.create(
            policy=sla_policy,
            priority=priority,
            first_response_minutes=fr,
            resolution_minutes=res,
        )
    return sla_policy


# ---------------------------------------------------------------------------
# Step 1 — Ticket priority model
# ---------------------------------------------------------------------------

class TestTicketPriorityModel:
    def test_priority_choices_contain_critical(self):
        keys = [k for k, _ in Ticket.PRIORITY_CHOICES]
        assert 'critical' in keys

    def test_priority_choices_do_not_contain_urgent(self):
        keys = [k for k, _ in Ticket.PRIORITY_CHOICES]
        assert 'urgent' not in keys

    def test_priority_choices_are_exactly_four(self):
        assert len(Ticket.PRIORITY_CHOICES) == 4

    def test_priority_order_critical_is_first(self):
        assert Ticket.PRIORITY_ORDER['critical'] == 0
        assert Ticket.PRIORITY_ORDER['low'] == 3

    def test_default_priority_is_medium(self, queue):
        ticket = Ticket.objects.create(queue=queue, title='Default priority')
        assert ticket.priority == 'medium'

    def test_ticket_has_sla_fields(self, ticket):
        assert hasattr(ticket, 'first_response_due')
        assert hasattr(ticket, 'resolution_due')
        assert ticket.first_response_due is None
        assert ticket.resolution_due is None

    def test_can_set_critical_priority(self, queue):
        ticket = Ticket.objects.create(
            queue=queue, title='Critical issue', priority='critical',
        )
        assert ticket.priority == 'critical'


class TestSLAPolicyModel:
    def test_create_sla_policy(self, project):
        policy = SLAPolicy.objects.create(project=project, name='Test SLA')
        assert policy.project == project
        assert policy.is_active is True

    def test_one_policy_per_project(self, project, sla_policy):
        with pytest.raises(Exception):
            SLAPolicy.objects.create(project=project, name='Duplicate SLA')

    def test_create_priority_target(self, sla_policy):
        target = SLAPriorityTarget.objects.create(
            policy=sla_policy,
            priority='critical',
            first_response_minutes=60,
            resolution_minutes=240,
        )
        assert target.first_response_minutes == 60
        assert target.resolution_minutes == 240

    def test_priority_target_unique_per_policy(self, sla_policy):
        SLAPriorityTarget.objects.create(
            policy=sla_policy, priority='high',
            first_response_minutes=240, resolution_minutes=480,
        )
        with pytest.raises(Exception):
            SLAPriorityTarget.objects.create(
                policy=sla_policy, priority='high',
                first_response_minutes=120, resolution_minutes=240,
            )


# ---------------------------------------------------------------------------
# Step 2 — SLA calculation service
# ---------------------------------------------------------------------------

class TestRecalculateTicketSla:
    def test_no_sla_policy_clears_dues(self, ticket):
        recalculate_ticket_sla(ticket)
        assert ticket.first_response_due is None
        assert ticket.resolution_due is None

    def test_inactive_policy_clears_dues(self, ticket, sla_policy):
        sla_policy.is_active = False
        sla_policy.save()
        SLAPriorityTarget.objects.create(
            policy=sla_policy, priority='medium',
            first_response_minutes=480, resolution_minutes=1440,
        )
        recalculate_ticket_sla(ticket)
        assert ticket.first_response_due is None
        assert ticket.resolution_due is None

    def test_no_matching_target_clears_dues(self, ticket, sla_policy):
        # Only 'critical' target exists, ticket is 'medium'
        SLAPriorityTarget.objects.create(
            policy=sla_policy, priority='critical',
            first_response_minutes=60, resolution_minutes=240,
        )
        recalculate_ticket_sla(ticket)
        assert ticket.first_response_due is None
        assert ticket.resolution_due is None

    def test_calculates_dues_from_created_at(self, ticket, full_sla_policy):
        ticket.priority = 'medium'
        recalculate_ticket_sla(ticket)

        expected_fr = ticket.created_at + timedelta(minutes=480)
        expected_res = ticket.created_at + timedelta(minutes=1440)

        assert abs((ticket.first_response_due - expected_fr).total_seconds()) < 1
        assert abs((ticket.resolution_due - expected_res).total_seconds()) < 1

    def test_critical_uses_shortest_targets(self, ticket, full_sla_policy):
        ticket.priority = 'critical'
        recalculate_ticket_sla(ticket)

        expected_fr = ticket.created_at + timedelta(minutes=60)
        assert abs((ticket.first_response_due - expected_fr).total_seconds()) < 1

    def test_low_uses_longest_targets(self, ticket, full_sla_policy):
        ticket.priority = 'low'
        recalculate_ticket_sla(ticket)

        expected_res = ticket.created_at + timedelta(minutes=2880)
        assert abs((ticket.resolution_due - expected_res).total_seconds()) < 1

    def test_changing_priority_recalculates_dues(self, ticket, full_sla_policy):
        ticket.priority = 'critical'
        recalculate_ticket_sla(ticket)
        critical_fr = ticket.first_response_due

        ticket.priority = 'low'
        recalculate_ticket_sla(ticket)
        low_fr = ticket.first_response_due

        assert low_fr > critical_fr

    def test_persists_after_save(self, ticket, full_sla_policy):
        ticket.priority = 'high'
        recalculate_ticket_sla(ticket)
        ticket.save()

        ticket.refresh_from_db()
        assert ticket.first_response_due is not None
        assert ticket.resolution_due is not None


class TestRecalculateTicketSlaAfterPolicyChange:
    def _old_targets(self, policy):
        return {
            t.priority: (t.first_response_minutes, t.resolution_minutes)
            for t in policy.priority_targets.all()
        }

    def test_preserves_priority_change_anchor_when_target_extended(
        self, ticket, full_sla_policy,
    ):
        """Mimics: priority changed to critical, then critical FR target increased."""
        anchor = timezone.now()
        ticket.priority = 'critical'
        recalculate_ticket_sla(ticket, base_time=anchor)
        old_targets = self._old_targets(full_sla_policy)

        SLAPriorityTarget.objects.filter(
            policy=full_sla_policy, priority='critical',
        ).update(first_response_minutes=200, resolution_minutes=240)

        recalculate_ticket_sla_after_policy_change(ticket, old_targets)

        expected_fr = anchor + timedelta(minutes=200)
        assert abs((ticket.first_response_due - expected_fr).total_seconds()) < 2
        assert ticket.first_response_due > timezone.now()

    def test_unchanged_target_for_other_priority_preserves_dues(
        self, ticket, full_sla_policy,
    ):
        ticket.priority = 'high'
        recalculate_ticket_sla(ticket)
        old_fr = ticket.first_response_due
        old_res = ticket.resolution_due
        old_targets = self._old_targets(full_sla_policy)

        SLAPriorityTarget.objects.filter(
            policy=full_sla_policy, priority='critical',
        ).update(first_response_minutes=30)

        recalculate_ticket_sla_after_policy_change(ticket, old_targets)

        assert ticket.first_response_due == old_fr
        assert ticket.resolution_due == old_res

    def test_falls_back_to_created_at_when_no_existing_due(
        self, ticket, full_sla_policy,
    ):
        old_targets = self._old_targets(full_sla_policy)
        recalculate_ticket_sla_after_policy_change(ticket, old_targets)

        expected_fr = ticket.created_at + timedelta(minutes=480)
        assert abs((ticket.first_response_due - expected_fr).total_seconds()) < 2

    def test_reactivate_uses_now_when_dues_were_cleared(
        self, ticket, full_sla_policy,
    ):
        ticket.priority = 'high'
        recalculate_ticket_sla(ticket)
        ticket.first_response_due = None
        ticket.resolution_due = None
        old_targets = self._old_targets(full_sla_policy)

        SLAPriorityTarget.objects.filter(
            policy=full_sla_policy, priority='high',
        ).update(first_response_minutes=300)

        before = timezone.now()
        recalculate_ticket_sla_after_policy_change(
            ticket, old_targets, policy_reactivated=True,
        )
        after = timezone.now()

        expected_fr = before + timedelta(minutes=300)
        assert ticket.first_response_due >= expected_fr - timedelta(seconds=2)
        assert ticket.first_response_due <= after + timedelta(minutes=300)
        assert ticket.first_response_due > timezone.now()


class TestGetSlaStatus:
    def test_no_dues_returns_nones(self, ticket):
        status = get_sla_status(ticket)
        assert status['first_response_due'] is None
        assert status['resolution_due'] is None
        assert status['first_response_breached'] is False
        assert status['resolution_breached'] is False
        assert status['first_response_remaining_seconds'] is None
        assert status['resolution_remaining_seconds'] is None

    def test_future_due_not_breached(self, ticket, full_sla_policy):
        ticket.priority = 'critical'
        recalculate_ticket_sla(ticket)

        status = get_sla_status(ticket)
        assert status['first_response_breached'] is False
        assert status['resolution_breached'] is False
        assert status['first_response_remaining_seconds'] > 0
        assert status['resolution_remaining_seconds'] > 0

    def test_past_due_is_breached(self, ticket):
        past = timezone.now() - timedelta(hours=1)
        ticket.first_response_due = past
        ticket.resolution_due = past

        status = get_sla_status(ticket)
        assert status['first_response_breached'] is True
        assert status['resolution_breached'] is True
        assert status['first_response_remaining_seconds'] < 0
        assert status['resolution_remaining_seconds'] < 0

    def test_returns_iso_datetime_strings(self, ticket, full_sla_policy):
        ticket.priority = 'medium'
        recalculate_ticket_sla(ticket)

        status = get_sla_status(ticket)
        assert isinstance(status['first_response_due'], str)
        assert 'T' in status['first_response_due']
