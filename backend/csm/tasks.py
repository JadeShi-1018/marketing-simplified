"""MED-215 — periodic ticket lifecycle tasks."""
from celery import shared_task

from csm.models import ConversationMessage
from csm.services.status_machine import (
    tickets_due_for_auto_resolve,
    RESOLVED_STATUS,
)


@shared_task
def auto_resolve_pending_tickets():
    """Move tickets stuck in Pending Customer Response past the configured cutoff
    to Resolved and send the configured notification to the customer.

    Runs on Celery Beat (see CELERY_BEAT_SCHEDULE). Returns the count resolved.
    """
    resolved = 0
    for ticket, config in list(tickets_due_for_auto_resolve()):
        ticket.status = RESOLVED_STATUS
        ticket.pending_since = None
        ticket.save(update_fields=['status', 'pending_since'])

        # Notify the customer via the linked conversation, mirroring the manual
        # resolve flow. The conversation's own status (MED-221) is left
        # untouched — ticket and conversation lifecycles are independent.
        # Tickets with no conversation are resolved silently.
        if ticket.conversation_id:
            ConversationMessage.objects.create(
                conversation_id=ticket.conversation_id,
                sender_type='system',
                content=config.notification_message,
            )
        resolved += 1
    return resolved
