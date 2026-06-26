"""SLA calculation service for CSM tickets."""

from datetime import timedelta
from django.utils import timezone


def _derive_sla_anchor(ticket, old_first_response_minutes):
    """Infer the SLA start time from an existing deadline and the old target."""
    if ticket.first_response_due is not None and old_first_response_minutes is not None:
        return ticket.first_response_due - timedelta(minutes=old_first_response_minutes)
    return None


def recalculate_ticket_sla(ticket, base_time=None):
    """
    Compute and persist first_response_due / resolution_due on a ticket.

    base_time: the reference point for deadline calculation.
      - None (default): uses ticket.created_at — for initial ticket creation.
      - timezone.now(): pass explicitly on priority change so the countdown
        restarts from the moment of the change, not the original creation time.
      - For policy updates, use recalculate_ticket_sla_after_policy_change() so
        each ticket keeps its existing SLA anchor.
    """
    from csm.models import SLAPolicy, SLAPriorityTarget

    project_id = _get_project_id(ticket)
    if not project_id:
        ticket.first_response_due = None
        ticket.resolution_due = None
        return

    try:
        policy = SLAPolicy.objects.get(project_id=project_id, is_active=True)
    except SLAPolicy.DoesNotExist:
        ticket.first_response_due = None
        ticket.resolution_due = None
        return

    try:
        target = SLAPriorityTarget.objects.get(
            policy=policy,
            priority=ticket.priority,
        )
    except SLAPriorityTarget.DoesNotExist:
        ticket.first_response_due = None
        ticket.resolution_due = None
        return

    if base_time is None:
        base_time = ticket.created_at or timezone.now()
    ticket.first_response_due = base_time + timedelta(minutes=target.first_response_minutes)
    ticket.resolution_due = base_time + timedelta(minutes=target.resolution_minutes)


def recalculate_ticket_sla_after_policy_change(
    ticket, old_targets_by_priority, *, policy_reactivated=False,
):
    """
    Recompute SLA dues after a policy update while preserving each ticket's anchor.

    old_targets_by_priority: dict mapping priority -> (first_response_minutes,
      resolution_minutes), snapshotted before targets are replaced.
    policy_reactivated: True when is_active flips from False to True. Tickets whose
      dues were cleared on deactivation restart from now(), not created_at.
    """
    old_fr_minutes = None
    old_entry = old_targets_by_priority.get(ticket.priority)
    if old_entry is not None:
        old_fr_minutes = old_entry[0]

    base_time = _derive_sla_anchor(ticket, old_fr_minutes)
    if base_time is None:
        if policy_reactivated:
            base_time = timezone.now()
        else:
            base_time = ticket.created_at or timezone.now()
    recalculate_ticket_sla(ticket, base_time=base_time)


def _get_project_id(ticket):
    """Resolve project_id from ticket → queue → project chain."""
    try:
        return ticket.queue.project_id
    except Exception:
        return None


def get_sla_status(ticket):
    """
    Return a dict describing the current SLA status for a ticket.

    Keys:
      first_response_due  – ISO datetime string or None
      resolution_due      – ISO datetime string or None
      first_response_breached – bool
      resolution_breached     – bool
      first_response_remaining_seconds – int or None
      resolution_remaining_seconds     – int or None
    """
    now = timezone.now()

    def _remaining(due):
        if due is None:
            return None
        return int((due - now).total_seconds())

    return {
        'first_response_due': ticket.first_response_due.isoformat() if ticket.first_response_due else None,
        'resolution_due': ticket.resolution_due.isoformat() if ticket.resolution_due else None,
        'first_response_breached': bool(
            ticket.first_response_due and now > ticket.first_response_due
        ),
        'resolution_breached': bool(
            ticket.resolution_due and now > ticket.resolution_due
        ),
        'first_response_remaining_seconds': _remaining(ticket.first_response_due),
        'resolution_remaining_seconds': _remaining(ticket.resolution_due),
    }
