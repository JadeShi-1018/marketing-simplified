"""MED-215 — Ticket status machine & lifecycle tests.

Covers the five acceptance criteria:
  1. Only permitted transitions are allowed (agent cannot jump to unreachable state)
  2. Admin creates a custom status at a position; it becomes usable on tickets
  3. Auto-resolution moves a stale Pending ticket to Resolved + notifies customer
  4. Editing transitions is immediately enforced
  5. Ticket detail exposes current status + available next statuses
"""
import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from csm.models import (
    Queue, Ticket, TicketStatus, TicketStatusTransition,
    Conversation, ConversationMessage,
)
from csm.services import status_machine as sm

pytestmark = pytest.mark.django_db


@pytest.fixture
def queue(project, customer_organisation):
    return Queue.objects.create(
        project=project, organisation=customer_organisation,
        name='Q', tier='T1',
    )


@pytest.fixture
def ticket(queue):
    return Ticket.objects.create(queue=queue, title='T', status='todo')


@pytest.fixture
def admin_client(api_client, project, customer_organisation, user):
    """Authenticated as a user who is both a ProjectMember (config endpoints,
    via the `project` fixture) and a CSM admin on the queue's organisation
    (ticket endpoints are scoped to CSM queue access)."""
    from csm.models import CustomerUser
    CustomerUser.objects.get_or_create(
        user=user, organisation=customer_organisation,
        defaults={'user_type': 'admin', 'is_active': True},
    )
    api_client.force_authenticate(user=user)
    return api_client


def _ticket_detail(pk):
    return reverse('ticket-detail', kwargs={'pk': pk})


# --- service layer --------------------------------------------------------

def test_seed_creates_five_builtins(project):
    sm.ensure_status_machine(project.id)
    slugs = set(
        TicketStatus.objects.filter(project=project, is_builtin=True)
        .values_list('slug', flat=True)
    )
    assert slugs == {'todo', 'in_progress', 'pending_customer', 'resolved', 'closed'}


def test_seed_is_idempotent(project):
    sm.ensure_status_machine(project.id)
    sm.ensure_status_machine(project.id)
    assert TicketStatus.objects.filter(project=project).count() == 5


def test_transition_allowed_and_blocked(project):
    sm.ensure_status_machine(project.id)
    assert sm.is_transition_allowed(project.id, 'todo', 'in_progress') is True
    assert sm.is_transition_allowed(project.id, 'todo', 'resolved') is False
    # same-status no-op always allowed
    assert sm.is_transition_allowed(project.id, 'todo', 'todo') is True


def test_next_statuses_are_only_reachable_ones(project):
    sm.ensure_status_machine(project.id)
    nexts = {s.slug for s in sm.get_next_statuses(project.id, 'todo')}
    assert nexts == {'in_progress'}


def test_insert_custom_status_shifts_order(project):
    sm.ensure_status_machine(project.id)
    new = sm.insert_custom_status(project.id, 'Awaiting Review', '#ff0000', position=2)
    ordered = list(
        TicketStatus.objects.filter(project=project).order_by('order').values_list('slug', flat=True)
    )
    assert ordered[2] == new.slug
    assert new.slug == 'awaiting_review'
    assert new.is_builtin is False
    # built-ins after the insertion point moved down, order stays unique/contiguous
    assert ordered == ['todo', 'in_progress', 'awaiting_review',
                       'pending_customer', 'resolved', 'closed']


# --- AC #1: enforce permitted transitions via API -------------------------

def test_patch_allowed_transition_succeeds(admin_client, ticket):
    resp = admin_client.patch(
        _ticket_detail(ticket.id), {'status': 'in_progress'}, format='json',
    )
    assert resp.status_code == status.HTTP_200_OK
    ticket.refresh_from_db()
    assert ticket.status == 'in_progress'


def test_patch_disallowed_transition_blocked(admin_client, ticket):
    resp = admin_client.patch(
        _ticket_detail(ticket.id), {'status': 'resolved'}, format='json',
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    ticket.refresh_from_db()
    assert ticket.status == 'todo'


def test_close_action_enforces_transition(admin_client, ticket):
    # todo -> closed is not a permitted edge by default
    resp = admin_client.post(reverse('ticket-close', kwargs={'pk': ticket.id}))
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


# --- AC #2: custom status usable on tickets via API -----------------------

def test_create_custom_status_then_use_on_ticket(admin_client, project, ticket):
    url = reverse('ticket-status-list') + f'?project={project.id}'
    resp = admin_client.post(
        url, {'name': 'Escalated', 'color': '#ff0000', 'position': 1}, format='json',
    )
    assert resp.status_code == status.HTTP_201_CREATED
    slug = resp.data['slug']
    # allow the transition, then move the ticket onto the custom status
    TicketStatusTransition.objects.create(
        project=project, from_status='todo', to_status=slug,
    )
    resp = admin_client.patch(
        _ticket_detail(ticket.id), {'status': slug}, format='json',
    )
    assert resp.status_code == status.HTTP_200_OK
    ticket.refresh_from_db()
    assert ticket.status == slug


# --- AC #4: editing transitions is immediately enforced -------------------

def test_replace_transitions_changes_enforcement(admin_client, project, ticket):
    url = reverse('ticket-status-machine') + f'?project={project.id}'
    # Remove todo->in_progress by replacing the whole set with only resolved->closed
    resp = admin_client.put(
        url, {'transitions': [{'from_status': 'resolved', 'to_status': 'closed'}]},
        format='json',
    )
    assert resp.status_code == status.HTTP_200_OK
    # now todo->in_progress must be blocked
    resp = admin_client.patch(
        _ticket_detail(ticket.id), {'status': 'in_progress'}, format='json',
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


# --- AC #5: ticket exposes current status + available next statuses -------

def test_ticket_detail_lists_available_next_statuses(admin_client, ticket):
    resp = admin_client.get(_ticket_detail(ticket.id))
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['status'] == 'todo'
    nexts = {s['slug'] for s in resp.data['available_next_statuses']}
    assert nexts == {'in_progress'}


# --- delete guardrails -----------------------------------------------------

def test_cannot_delete_builtin_status(admin_client, project):
    sm.ensure_status_machine(project.id)
    todo = TicketStatus.objects.get(project=project, slug='todo')
    resp = admin_client.delete(
        reverse('ticket-status-detail', kwargs={'pk': todo.id}) + f'?project={project.id}'
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


def test_delete_custom_status_in_use_requires_confirm(admin_client, project, ticket):
    custom = sm.insert_custom_status(project.id, 'Blocked', '#000000', position=1)
    ticket.status = custom.slug
    ticket.save(update_fields=['status'])
    detail = reverse('ticket-status-detail', kwargs={'pk': custom.id})
    # without confirm -> warned
    resp = admin_client.delete(detail + f'?project={project.id}')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    # DRF stringifies values inside a validation-error payload.
    assert int(resp.data['tickets_in_use']) == 1
    # with confirm -> deleted, and the ticket is moved off the deleted status
    # (reassigned to the default built-in) rather than stranded on a dead slug
    resp = admin_client.delete(detail + f'?project={project.id}&confirm=true')
    assert resp.status_code == status.HTTP_204_NO_CONTENT
    ticket.refresh_from_db()
    assert ticket.status == 'in_progress'


# --- AC #3: automatic resolution ------------------------------------------

@pytest.fixture
def pending_ticket(queue):
    conv = Conversation.objects.create(queue=queue)
    return Ticket.objects.create(
        queue=queue, title='Stale', status='pending_customer',
        conversation=conv,
        pending_since=timezone.now() - timezone.timedelta(days=4),
    )


def test_auto_resolve_moves_stale_pending_to_resolved(project, pending_ticket):
    from csm.tasks import auto_resolve_pending_tickets
    config = sm.get_auto_resolve_config(project.id)
    config.enabled = True
    config.days_until_resolve = 3
    config.notification_message = 'Auto-resolved: no reply.'
    config.save()

    count = auto_resolve_pending_tickets()

    assert count == 1
    pending_ticket.refresh_from_db()
    assert pending_ticket.status == 'resolved'
    assert pending_ticket.pending_since is None
    msg = ConversationMessage.objects.filter(
        conversation=pending_ticket.conversation, sender_type='system',
    ).latest('created_at')
    assert msg.content == 'Auto-resolved: no reply.'


def test_auto_resolve_skips_when_customer_replied(project, pending_ticket):
    from csm.tasks import auto_resolve_pending_tickets
    config = sm.get_auto_resolve_config(project.id)
    config.enabled = True
    config.days_until_resolve = 3
    config.save()
    # customer replied after entering pending -> not stale
    ConversationMessage.objects.create(
        conversation=pending_ticket.conversation,
        sender_type='customer', content='still here',
    )

    count = auto_resolve_pending_tickets()

    assert count == 0
    pending_ticket.refresh_from_db()
    assert pending_ticket.status == 'pending_customer'


def test_auto_resolve_disabled_does_nothing(project, pending_ticket):
    from csm.tasks import auto_resolve_pending_tickets
    # config exists but disabled by default
    sm.get_auto_resolve_config(project.id)
    assert auto_resolve_pending_tickets() == 0
    pending_ticket.refresh_from_db()
    assert pending_ticket.status == 'pending_customer'


# --- manual status changes must NOT notify the customer -------------------
# MED-215 only requires a customer notification on *auto*-resolution. A manual
# resolve/close is a plain transition; these guard against a system message
# creeping back in (it used to, and was removed).

def test_manual_resolve_does_not_notify_customer(admin_client, queue):
    conv = Conversation.objects.create(queue=queue)
    t = Ticket.objects.create(
        queue=queue, title='M', status='pending_customer', conversation=conv,
    )
    resp = admin_client.patch(
        _ticket_detail(t.id), {'status': 'resolved'}, format='json',
    )
    assert resp.status_code == status.HTTP_200_OK
    t.refresh_from_db()
    assert t.status == 'resolved'
    assert not ConversationMessage.objects.filter(
        conversation=conv, sender_type='system',
    ).exists()


def test_manual_close_does_not_notify_customer(admin_client, queue):
    conv = Conversation.objects.create(queue=queue)
    t = Ticket.objects.create(
        queue=queue, title='C', status='resolved', conversation=conv,
    )
    resp = admin_client.post(reverse('ticket-close', kwargs={'pk': t.id}))
    assert resp.status_code == status.HTTP_200_OK
    t.refresh_from_db()
    assert t.status == 'closed'
    assert not ConversationMessage.objects.filter(
        conversation=conv, sender_type='system',
    ).exists()
