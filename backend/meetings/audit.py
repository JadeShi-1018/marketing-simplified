from typing import Any, Dict, Optional
from django.contrib.auth import get_user_model
from meetings.models import Meeting, MeetingAuditLog

User = get_user_model()

def record_audit_entry(
    meeting: Meeting,
    actor: Optional[User],
    event_type: str,
    before: Optional[Dict[str, Any]] = None,
    after: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
) -> MeetingAuditLog:
    """
    Record a single immutable audit entry for a meeting mutation.
    Call this function from the service layer immediately after a mutation succeeds.
    The function assumes the mutation has already been persisted to the database.

    Args:
        meeting: The Meeting being audited.
        actor: The User who triggered the mutation, or None for system events.
        event_type: Enum value from MeetingAuditLog.EVENT_TYPE_CHOICES
                   (e.g., 'meeting.status_changed').
        before: Dict of {field: old_value} for changed fields only.
               Pass None or {} if not applicable.
        after: Dict of {field: new_value} for changed fields only.
              Pass None or {} if not applicable.
        context: Event-specific metadata dict. Defaults to {}.

    Returns:
        The created MeetingAuditLog instance.

    Raises:
        ValueError: if event_type is not in MeetingAuditLog.EVENT_TYPE_CHOICES.

    Example:
        old_status = meeting.status
        meeting.status = 'planned'
        meeting.save(update_fields=['status'])

        audit.record_audit_entry(
            meeting=meeting,
            actor=request.user,
            event_type='meeting.status_changed',
            before={'status': old_status},
            after={'status': meeting.status},
            context={'reason': 'user_initiated'},
        )
    """
    valid_types = dict(MeetingAuditLog.EVENT_TYPE_CHOICES)
    if event_type not in valid_types:
        raise ValueError(
            f"Invalid event_type: {event_type}. "
            f"Valid choices: {', '.join(valid_types.keys())}"
        )

    return MeetingAuditLog.objects.create(
        meeting=meeting,
        actor=actor,
        event_type=event_type,
        before=before or None,
        after=after or None,
        context=context or {},
    )
