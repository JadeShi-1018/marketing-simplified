from django.utils import timezone

from meetings.models import MeetingDecisionOrigin


def create_meeting_decision_origin(meeting, decision, user=None, **kwargs):
    created_by = (
        user
        or getattr(decision, "author", None)
        or getattr(meeting, "created_by", None)
        or getattr(meeting, "user", None)
    )
    if created_by is None:
        raise ValueError(
            "create_meeting_decision_origin requires a user when decision/meeting has no owner."
        )

    return MeetingDecisionOrigin.objects.create(
        meeting=meeting,
        decision=decision,
        origin_timestamp=kwargs.pop("origin_timestamp", timezone.now()),
        creation_context=kwargs.pop(
            "creation_context",
            {
                "source": "test",
                "meeting_id": meeting.id,
                "decision_id": decision.id,
            },
        ),
        created_by=created_by,
        **kwargs,
    )
