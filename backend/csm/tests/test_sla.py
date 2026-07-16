"""Tests for ticket priority model changes and SLA calculation service (MED-218)."""

import pytest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from django.utils import timezone

from csm.models import (
    Queue, Ticket, SLAPolicy, SLAPriorityTarget, BusinessHoursCalendar,
    CustomerUser, CsmNotification,
)
from csm.services.sla import (
    recalculate_ticket_sla,
    recalculate_ticket_sla_after_policy_change,
    get_sla_status,
    resume_sla_clock,
)
from csm.tasks import notify_sla_breaches

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

    def test_multiple_policies_per_project(self, project, sla_policy):
        # A project may hold several policies; queues pick one.
        second = SLAPolicy.objects.create(project=project, name='Premium SLA')
        assert second.project == project
        assert project.sla_policies.count() == 2

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

    def test_past_due_is_breached(self, ticket, full_sla_policy):
        # An active policy is required for the deadlines to count as a live SLA.
        past = timezone.now() - timedelta(hours=1)
        ticket.first_response_due = past
        ticket.resolution_due = past

        status = get_sla_status(ticket)
        assert status['first_response_breached'] is True
        assert status['resolution_breached'] is True
        assert status['first_response_remaining_seconds'] < 0
        assert status['resolution_remaining_seconds'] < 0

    def test_resolved_ticket_stops_resolution_countdown(self, ticket, full_sla_policy):
        # A resolved ticket is done: the resolution leg stops instead of ticking
        # or reading as breached, even with a deadline in the past.
        ticket.resolution_due = timezone.now() - timedelta(hours=1)
        ticket.status = 'resolved'

        status = get_sla_status(ticket)
        assert status['resolution_remaining_seconds'] is None
        assert status['resolution_breached'] is False
        assert status['resolution_state'] is None

    def test_stored_dues_read_as_no_sla_when_policy_inactive(self, ticket, full_sla_policy):
        # Model B: the active policy is the source of truth. Dues left on a ticket
        # while tracking is off read as no-SLA and do not breach.
        past = timezone.now() - timedelta(hours=1)
        ticket.first_response_due = past
        ticket.resolution_due = past
        full_sla_policy.is_active = False
        full_sla_policy.save()

        status = get_sla_status(ticket)
        assert status['first_response_breached'] is False
        assert status['resolution_breached'] is False
        assert status['first_response_state'] is None
        assert status['resolution_state'] is None

    def test_returns_iso_datetime_strings(self, ticket, full_sla_policy):
        ticket.priority = 'medium'
        recalculate_ticket_sla(ticket)

        status = get_sla_status(ticket)
        assert isinstance(status['first_response_due'], str)
        assert 'T' in status['first_response_due']


class TestBusinessHoursCountdown:
    """SLA due dates advance only during a calendar's open hours."""

    def _weekday_calendar(self, project):
        # Default schedule is Monday-Friday 09:00-17:00.
        return BusinessHoursCalendar.objects.create(
            project=project, name='Weekdays 9-5', timezone='UTC',
        )

    def test_due_dates_skip_nights_and_weekends(self, ticket, full_sla_policy):
        full_sla_policy.calendar = self._weekday_calendar(full_sla_policy.project)
        full_sla_policy.save()

        monday_9am = datetime(2024, 1, 1, 9, tzinfo=ZoneInfo('UTC'))
        recalculate_ticket_sla(ticket, base_time=monday_9am)

        # medium: 8 working hours first response -> same day 17:00.
        assert ticket.first_response_due == datetime(2024, 1, 1, 17, tzinfo=ZoneInfo('UTC'))
        # medium: 24 working hours resolution -> three working days -> Wed 17:00.
        assert ticket.resolution_due == datetime(2024, 1, 3, 17, tzinfo=ZoneInfo('UTC'))

    def test_friday_evening_spills_into_monday(self, ticket, full_sla_policy):
        full_sla_policy.calendar = self._weekday_calendar(full_sla_policy.project)
        full_sla_policy.save()

        friday_4pm = datetime(2024, 1, 5, 16, tzinfo=ZoneInfo('UTC'))
        recalculate_ticket_sla(ticket, base_time=friday_4pm)

        # 8h first response: Fri 16-17 (1h) + Mon 09-16 (7h) = Mon 16:00.
        assert ticket.first_response_due == datetime(2024, 1, 8, 16, tzinfo=ZoneInfo('UTC'))

    def test_no_calendar_counts_wall_clock(self, ticket, full_sla_policy):
        friday_4pm = datetime(2024, 1, 5, 16, tzinfo=ZoneInfo('UTC'))
        recalculate_ticket_sla(ticket, base_time=friday_4pm)

        # No calendar -> raw elapsed time straight through the weekend.
        assert ticket.first_response_due == friday_4pm + timedelta(minutes=480)


class TestSlaState:
    """first_response_state / resolution_state drive the timer colour."""

    def test_amber_when_under_a_quarter_remains(self, ticket, full_sla_policy):
        # medium first response target is 480 min; a quarter is 120 min.
        ticket.first_response_due = timezone.now() + timedelta(minutes=60)
        ticket.resolution_due = timezone.now() + timedelta(hours=20)

        status = get_sla_status(ticket)
        assert status['first_response_state'] == 'amber'
        assert status['resolution_state'] == 'ok'

    def test_breached_state(self, ticket, full_sla_policy):
        ticket.first_response_due = timezone.now() - timedelta(minutes=5)

        status = get_sla_status(ticket)
        assert status['first_response_state'] == 'breached'

    def test_no_due_leaves_state_none(self, ticket):
        status = get_sla_status(ticket)
        assert status['first_response_state'] is None
        assert status['resolution_state'] is None


class TestSlaPauseResume:
    """Time in Pending Customer Response is credited back on resume."""

    def test_resume_extends_dues_by_paused_time(self, ticket, full_sla_policy):
        recalculate_ticket_sla(ticket)
        ticket.save()
        orig_fr = ticket.first_response_due
        orig_res = ticket.resolution_due

        ticket.status = 'pending_customer'
        ticket.save()
        assert ticket.pending_since is not None

        # Two hours spent waiting on the customer.
        ticket.pending_since = timezone.now() - timedelta(hours=2)
        ticket.save(update_fields=['pending_since'])

        ticket.status = 'in_progress'
        ticket.save()

        assert ticket.pending_since is None
        assert abs((ticket.first_response_due - orig_fr) - timedelta(hours=2)) < timedelta(seconds=10)
        assert abs((ticket.resolution_due - orig_res) - timedelta(hours=2)) < timedelta(seconds=10)

    def test_no_extension_when_pause_disabled(self, ticket, full_sla_policy):
        full_sla_policy.pause_on_pending = False
        full_sla_policy.save()
        recalculate_ticket_sla(ticket)
        ticket.save()
        orig_fr = ticket.first_response_due

        ticket.status = 'pending_customer'
        ticket.save()
        ticket.pending_since = timezone.now() - timedelta(hours=2)
        ticket.save(update_fields=['pending_since'])
        ticket.status = 'in_progress'
        ticket.save()

        assert ticket.pending_since is None
        assert ticket.first_response_due == orig_fr

    def test_business_hours_resume_credits_only_open_time(self, ticket, full_sla_policy):
        cal = BusinessHoursCalendar.objects.create(
            project=full_sla_policy.project, name='Weekdays 9-5', timezone='UTC',
        )
        full_sla_policy.calendar = cal
        full_sla_policy.save()

        ticket.first_response_due = datetime(2024, 1, 8, 12, tzinfo=ZoneInfo('UTC'))  # Mon noon
        ticket.resolution_due = None
        # Paused Fri 16:00 -> Mon 10:00 = 2 business hours (Fri 16-17 + Mon 9-10).
        ticket.pending_since = datetime(2024, 1, 5, 16, tzinfo=ZoneInfo('UTC'))
        resume_sla_clock(ticket, now=datetime(2024, 1, 8, 10, tzinfo=ZoneInfo('UTC')))

        # Mon noon + 2 business hours = Mon 14:00.
        assert ticket.first_response_due == datetime(2024, 1, 8, 14, tzinfo=ZoneInfo('UTC'))


class TestPolicyResolution:
    """A ticket resolves to its queue's policy, else the project default."""

    def _policy_with_medium(self, project, name, fr, res, is_default=False):
        policy = SLAPolicy.objects.create(project=project, name=name, is_default=is_default)
        SLAPriorityTarget.objects.create(
            policy=policy, priority='medium',
            first_response_minutes=fr, resolution_minutes=res,
        )
        return policy

    def test_falls_back_to_project_default(self, ticket, project):
        self._policy_with_medium(project, 'Proj Default', 480, 1440, is_default=True)
        recalculate_ticket_sla(ticket)
        expected_fr = ticket.created_at + timedelta(minutes=480)
        assert abs((ticket.first_response_due - expected_fr).total_seconds()) < 1

    def test_queue_policy_overrides_default(self, ticket, queue, project):
        self._policy_with_medium(project, 'Proj Default', 480, 1440, is_default=True)
        premium = self._policy_with_medium(project, 'Premium', 60, 240)
        queue.sla_policy = premium
        queue.save()
        recalculate_ticket_sla(ticket)
        expected_fr = ticket.created_at + timedelta(minutes=60)
        assert abs((ticket.first_response_due - expected_fr).total_seconds()) < 1

    def test_inactive_queue_policy_falls_back_to_default(self, ticket, queue, project):
        self._policy_with_medium(project, 'Proj Default', 480, 1440, is_default=True)
        premium = self._policy_with_medium(project, 'Premium', 60, 240)
        premium.is_active = False
        premium.save()
        queue.sla_policy = premium
        queue.save()
        recalculate_ticket_sla(ticket)
        expected_fr = ticket.created_at + timedelta(minutes=480)
        assert abs((ticket.first_response_due - expected_fr).total_seconds()) < 1


class TestFirstResponseStops:
    """The first-response leg freezes once an agent has replied."""

    def test_response_stops_countdown(self, ticket, full_sla_policy):
        recalculate_ticket_sla(ticket)
        ticket.save()
        # Reply well before the deadline.
        ticket.first_responded_at = ticket.first_response_due - timedelta(hours=1)
        status = get_sla_status(ticket)
        assert status['first_response_remaining_seconds'] is None
        assert status['first_response_breached'] is False
        assert status['first_response_state'] == 'ok'

    def test_late_response_records_breach(self, ticket, full_sla_policy):
        recalculate_ticket_sla(ticket)
        ticket.save()
        # Reply after the deadline.
        ticket.first_responded_at = ticket.first_response_due + timedelta(hours=1)
        status = get_sla_status(ticket)
        assert status['first_response_remaining_seconds'] is None
        assert status['first_response_breached'] is True
        assert status['first_response_state'] == 'breached'


class TestBreachNotifications:
    """A breach alerts the assigned agent and queue supervisors, once each."""

    def _breach_ticket(self, ticket, agent):
        ticket.assigned_to = agent
        ticket.status = 'in_progress'
        ticket.resolution_due = timezone.now() - timedelta(minutes=5)
        ticket.save()
        return ticket

    def test_notifies_agent_and_supervisor(self, ticket, queue, user, user2, mailoutbox, full_sla_policy):
        self._breach_ticket(ticket, user)
        CustomerUser.objects.create(user=user2, queue=queue, user_type='supervisor')

        count = notify_sla_breaches()

        assert count == 1
        recipients = set(
            CsmNotification.objects.filter(notification_type='sla_breach')
            .values_list('recipient_id', flat=True)
        )
        assert recipients == {user.id, user2.id}
        assert len(mailoutbox) == 1
        ticket.refresh_from_db()
        assert ticket.resolution_breach_notified is True

    def test_notifies_only_once(self, ticket, queue, user, mailoutbox, full_sla_policy):
        self._breach_ticket(ticket, user)

        assert notify_sla_breaches() == 1
        assert notify_sla_breaches() == 0
        assert len(mailoutbox) == 1

    def test_paused_ticket_not_breached(self, ticket, queue, user, mailoutbox, full_sla_policy):
        ticket.assigned_to = user
        ticket.resolution_due = timezone.now() - timedelta(minutes=5)
        ticket.status = 'pending_customer'
        ticket.save()

        assert notify_sla_breaches() == 0
        assert len(mailoutbox) == 0

    def test_inactive_policy_not_breached(self, ticket, queue, user, mailoutbox, full_sla_policy):
        # Model B: a stored deadline under switched-off tracking is not a breach.
        self._breach_ticket(ticket, user)
        full_sla_policy.is_active = False
        full_sla_policy.save()

        assert notify_sla_breaches() == 0
        assert len(mailoutbox) == 0


class TestClockRunning:
    """The countdown only advances during open hours and while not paused."""

    def _calendar(self, project):
        # Monday-Friday 09:00-17:00 UTC (default schedule).
        return BusinessHoursCalendar.objects.create(
            project=project, name='Weekdays 9-5', timezone='UTC',
        )

    def test_running_during_business_hours(self, ticket, full_sla_policy):
        from csm.services.sla import _clock_running, _resolve_policy_target
        full_sla_policy.calendar = self._calendar(full_sla_policy.project)
        full_sla_policy.save()
        policy, target, calendar = _resolve_policy_target(ticket)
        monday_10am = datetime(2024, 1, 1, 10, tzinfo=ZoneInfo('UTC'))
        assert _clock_running(ticket, policy, target, calendar, monday_10am) is True

    def test_frozen_outside_business_hours(self, ticket, full_sla_policy):
        from csm.services.sla import _clock_running, _resolve_policy_target
        full_sla_policy.calendar = self._calendar(full_sla_policy.project)
        full_sla_policy.save()
        policy, target, calendar = _resolve_policy_target(ticket)
        monday_8pm = datetime(2024, 1, 1, 20, tzinfo=ZoneInfo('UTC'))
        assert _clock_running(ticket, policy, target, calendar, monday_8pm) is False

    def test_frozen_while_paused(self, ticket, full_sla_policy):
        from csm.services.sla import _clock_running, _resolve_policy_target
        ticket.status = 'pending_customer'
        policy, target, calendar = _resolve_policy_target(ticket)
        assert _clock_running(ticket, policy, target, calendar, timezone.now()) is False

    def test_running_without_calendar(self, ticket, full_sla_policy):
        from csm.services.sla import _clock_running, _resolve_policy_target
        policy, target, calendar = _resolve_policy_target(ticket)
        assert calendar is None
        assert _clock_running(ticket, policy, target, calendar, timezone.now()) is True


class TestFirstResponseNoSlaWhenPolicyInactive:
    """A past reply must not read as 'met' once the ticket is no longer SLA-bound."""

    def test_met_false_when_policy_inactive(self, ticket, full_sla_policy):
        recalculate_ticket_sla(ticket)
        ticket.first_responded_at = timezone.now()
        ticket.save()
        # Switching SLA tracking off removes the target for this ticket.
        full_sla_policy.is_active = False
        full_sla_policy.save()

        status = get_sla_status(ticket)
        assert status['first_response_met'] is False
        assert status['first_response_state'] is None
        assert status['first_response_remaining_seconds'] is None
