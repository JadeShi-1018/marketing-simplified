"""MED-215 — Ticket status machine & lifecycle.

Source of truth for a project's ticket statuses, the permitted transitions
between them, and the auto-resolution rule. Statuses are referenced by slug
everywhere (Ticket.status stores the slug) so custom statuses need no schema
change.
"""
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from csm.models import (
    Ticket,
    TicketStatus,
    TicketStatusTransition,
    TicketAutoResolveConfig,
)

# Five built-in statuses, in canonical order. (slug, name, color)
BUILTIN_STATUSES = [
    ('todo', 'To Do', '#94a3b8'),
    ('in_progress', 'In Progress', '#3b82f6'),
    ('pending_customer', 'Pending Customer Response', '#f59e0b'),
    ('resolved', 'Resolved', '#22c55e'),
    ('closed', 'Closed', '#64748b'),
]

# Default permitted transitions seeded for a new project. Sensible support
# lifecycle incl. reopen paths; admins edit these freely afterwards.
DEFAULT_TRANSITIONS = [
    ('todo', 'in_progress'),
    ('in_progress', 'pending_customer'),
    ('in_progress', 'resolved'),
    ('pending_customer', 'in_progress'),
    ('pending_customer', 'resolved'),
    ('resolved', 'closed'),
    ('resolved', 'in_progress'),   # reopen
    ('closed', 'in_progress'),     # reopen
]

PENDING_STATUS = 'pending_customer'
RESOLVED_STATUS = 'resolved'


@transaction.atomic
def ensure_status_machine(project_id):
    """Idempotently seed the five built-in statuses + default transitions for a
    project. Cheap no-op once seeded. New projects get seeded lazily on first
    access rather than via a signal."""
    if TicketStatus.objects.filter(project_id=project_id, is_builtin=True).exists():
        return
    for order, (slug, name, color) in enumerate(BUILTIN_STATUSES):
        TicketStatus.objects.get_or_create(
            project_id=project_id, slug=slug,
            defaults={'name': name, 'color': color, 'order': order,
                      'is_builtin': True},
        )
    for from_status, to_status in DEFAULT_TRANSITIONS:
        TicketStatusTransition.objects.get_or_create(
            project_id=project_id, from_status=from_status, to_status=to_status,
        )


def get_statuses(project_id):
    ensure_status_machine(project_id)
    return TicketStatus.objects.filter(project_id=project_id, is_active=True)


def get_transitions(project_id):
    ensure_status_machine(project_id)
    return TicketStatusTransition.objects.filter(project_id=project_id)


def is_transition_allowed(project_id, from_status, to_status):
    """A no-op (same status) is always allowed; otherwise the edge must exist."""
    if from_status == to_status:
        return True
    ensure_status_machine(project_id)
    return TicketStatusTransition.objects.filter(
        project_id=project_id, from_status=from_status, to_status=to_status,
    ).exists()


def get_status(project_id, slug):
    """The TicketStatus row for a slug (built-in or custom), or None. Seeds the
    built-ins first so a never-configured project still resolves them. Used to
    render a ticket's current status name + color (custom statuses aren't in the
    model's STATUS_CHOICES, so get_status_display() alone falls back to the slug)."""
    if project_id is None:
        return None
    ensure_status_machine(project_id)
    return TicketStatus.objects.filter(project_id=project_id, slug=slug).first()


def get_next_statuses(project_id, from_status):
    """Active statuses reachable from `from_status` (for the agent UI)."""
    ensure_status_machine(project_id)
    to_slugs = TicketStatusTransition.objects.filter(
        project_id=project_id, from_status=from_status,
    ).values_list('to_status', flat=True)
    return TicketStatus.objects.filter(
        project_id=project_id, is_active=True, slug__in=list(to_slugs),
    )


def assert_transition_allowed(ticket, to_status):
    """Raise ValidationError if moving `ticket` to `to_status` is not permitted.
    Called by every status-change entry point (PATCH, claim, close)."""
    project_id = ticket.queue.project_id
    if project_id is None:
        return  # queue not tied to a project: no machine to enforce
    if not is_transition_allowed(project_id, ticket.status, to_status):
        raise ValidationError({
            'status': (
                f"Transition '{ticket.status}' -> '{to_status}' is not permitted."
            )
        })


@transaction.atomic
def insert_custom_status(project_id, name, color, position):
    """Create a custom status and place it at `position` in the ordered
    sequence, shifting later statuses down. Returns the new TicketStatus."""
    ensure_status_machine(project_id)
    slug = _unique_slug(project_id, name)
    ordered = list(
        TicketStatus.objects.filter(project_id=project_id).order_by('order', 'id')
    )
    position = max(0, min(position, len(ordered)))
    for status in ordered[position:]:
        status.order += 1
        status.save(update_fields=['order'])
    return TicketStatus.objects.create(
        project_id=project_id, slug=slug, name=name,
        color=color or '#94a3b8', order=position, is_builtin=False,
    )


def _unique_slug(project_id, name):
    base = slugify(name).replace('-', '_')[:50] or 'status'
    slug = base
    i = 2
    while TicketStatus.objects.filter(project_id=project_id, slug=slug).exists():
        suffix = f'_{i}'
        slug = base[:50 - len(suffix)] + suffix
        i += 1
    return slug


def tickets_using_status(project_id, slug):
    """Non-archived tickets currently on this status (for delete warning)."""
    return Ticket.objects.filter(queue__project_id=project_id, status=slug)


def get_auto_resolve_config(project_id):
    ensure_status_machine(project_id)
    config, _ = TicketAutoResolveConfig.objects.get_or_create(project_id=project_id)
    return config


def tickets_due_for_auto_resolve(now=None):
    """Yield tickets eligible for auto-resolution: enabled project config, ticket
    in Pending Customer Response past the cutoff, and no customer reply since it
    entered pending."""
    now = now or timezone.now()
    configs = TicketAutoResolveConfig.objects.filter(enabled=True)
    for config in configs:
        cutoff = now - timezone.timedelta(days=config.days_until_resolve)
        candidates = Ticket.objects.filter(
            queue__project_id=config.project_id,
            status=PENDING_STATUS,
            pending_since__isnull=False,
            pending_since__lte=cutoff,
        ).select_related('conversation')
        for ticket in candidates:
            if not _customer_replied_since(ticket, ticket.pending_since):
                yield ticket, config


def _customer_replied_since(ticket, since):
    if ticket.conversation_id is None or since is None:
        return False
    from csm.models import ConversationMessage
    return ConversationMessage.objects.filter(
        conversation_id=ticket.conversation_id,
        sender_type='customer',
        created_at__gt=since,
    ).exists()
