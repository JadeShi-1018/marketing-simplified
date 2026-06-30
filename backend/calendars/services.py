"""
CalendarEvent query service.
Abstracts raw database queries from the API layer.

Also hosts the recurring-event scope logic (this / this-and-future / all):
keeping this business logic here keeps the views thin (fat core, thin edges).
"""
import uuid
from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Q, QuerySet

from .models import (
    CalendarEvent,
    Event,
    EventAttendee,
    EventReminder,
    RecurrenceException,
    RecurrenceRule,
)


def get_calendar_events(
    organization,
    start: str | None = None,
    end: str | None = None,
    event_type: str | None = None,
    project_id: str | None = None,
) -> QuerySet:
    """
    Query CalendarEvents for a given organization with optional filters.
    Returns a sorted, UI-ready queryset.

    Args:
        organization: The organization to scope the query to
        start: ISO datetime string for start of range (inclusive)
        end: ISO datetime string for end of range (exclusive)
        event_type: Filter by event type (decision / task / decision_review)
        project_id: Filter by project ID

    Returns:
        QuerySet of CalendarEvent ordered by start_time
    """
    queryset = CalendarEvent.objects.filter(
        organization=organization,
    ).select_related('decision', 'task', 'review')

    if start:
        queryset = queryset.filter(start_time__gte=start)

    if end:
        queryset = queryset.filter(start_time__lt=end)

    if event_type:
        queryset = queryset.filter(event_type=event_type)

    if project_id:
        queryset = queryset.filter(
            Q(decision__project_id=project_id) |
            Q(task__project_id=project_id)
        )

    return queryset.order_by('start_time')


# ---------------------------------------------------------------------------
# Recurring-event scope logic (this / this-and-future / all)
# ---------------------------------------------------------------------------
#
# Editable Event fields a scope edit may carry. We deliberately exclude
# recurrence/identity fields so a scope edit can never mutate the pattern or
# tenant of an event by accident.
_EDITABLE_EVENT_FIELDS = frozenset(
    {
        "calendar_id",
        "title",
        "description",
        "start_datetime",
        "end_datetime",
        "timezone",
        "is_all_day",
        "location",
        "location_lat",
        "location_lng",
        "status",
        "event_type",
        "color",
        "visibility",
        "has_conference",
        "conference_data",
        "guests_can_modify",
        "guests_can_invite_others",
        "guests_can_see_other_guests",
        "attachments",
        "metadata",
    }
)


def _sanitized_scope_payload(data: dict | None) -> dict:
    """
    Strip recurrence/identity keys from an incoming scope-edit payload so the
    EventCreateUpdateSerializer never tries to (a) toggle is_recurring without a
    matching pattern (its validate() would reject that) or (b) rewrite the
    recurrence rule. Scope edits change occurrence data, not the pattern.
    """
    if not data:
        return {}
    return {
        key: value
        for key, value in data.items()
        if key in _EDITABLE_EVENT_FIELDS
    }


def _rule_step(rule: RecurrenceRule) -> timedelta | None:
    """
    Step between occurrences for the patterns expansion supports (DAILY/WEEKLY).
    Returns None for patterns expansion does not currently materialize.
    """
    interval = max(int(rule.interval or 1), 1)
    if rule.frequency == "DAILY":
        return timedelta(days=interval)
    if rule.frequency == "WEEKLY":
        return timedelta(weeks=interval)
    return None


def _count_occurrences_before(
    series_start: datetime, boundary: datetime, rule: RecurrenceRule
) -> int:
    """
    Count occurrences with start in [series_start, boundary). Used to recompute
    COUNT when splitting a count-bounded series. Strict-less upper bound mirrors
    the expansion off-by-one rule so the boundary occurrence belongs to the new
    series, not the capped master.
    """
    step = _rule_step(rule)
    if step is None:
        return 0
    count = 0
    current = series_start
    while current < boundary:
        count += 1
        current = current + step
    return count


def _get_or_create_modified_event(
    event: Event, original_start: datetime
) -> tuple[Event, RecurrenceException | None]:
    """
    Return the per-occurrence override Event for `original_start`, creating a
    one-off clone (and its RecurrenceException) if none exists yet. The clone is
    never recurring and never carries a recurrence_rule, honoring the
    RecurrenceException recursion guard.
    """
    exc = (
        RecurrenceException.objects.filter(
            organization=event.organization,
            recurrence_rule=event.recurrence_rule,
            original_event=event,
            exception_date=original_start,
        )
        .select_related("modified_event")
        .first()
    )

    if exc and not exc.is_cancelled and exc.modified_event_id:
        return exc.modified_event, exc

    cloned = Event.objects.get(pk=event.pk)
    cloned.pk = None
    cloned.id = uuid.uuid4()
    cloned.is_recurring = False
    cloned.recurrence_rule = None
    cloned.original_start = original_start
    duration = event.end_datetime - event.start_datetime
    cloned.start_datetime = original_start
    cloned.end_datetime = original_start + duration
    cloned.ical_uid = None
    cloned.is_deleted = False
    cloned.save()

    if exc:
        exc.is_cancelled = False
        exc.modified_event = cloned
        exc.exception_date = original_start
        exc.organization = event.organization
        exc.recurrence_rule = event.recurrence_rule
        exc.original_event = event
        exc.save()
    else:
        exc = RecurrenceException.objects.create(
            organization=event.organization,
            recurrence_rule=event.recurrence_rule,
            original_event=event,
            exception_date=original_start,
            is_cancelled=False,
            modified_event=cloned,
        )

    return cloned, exc


def modify_single_occurrence(
    event: Event, original_start: datetime, data: dict, context: dict
) -> Event:
    """
    Scope = "this only": apply the edit to a single occurrence via a
    RecurrenceException override, leaving the master series untouched.
    """
    from .serializers import EventCreateUpdateSerializer

    with transaction.atomic():
        modified_event, _exc = _get_or_create_modified_event(event, original_start)

        serializer = EventCreateUpdateSerializer(
            modified_event,
            data=_sanitized_scope_payload(data),
            partial=True,
            context=context,
        )
        serializer.is_valid(raise_exception=True)
        return serializer.save()


def cancel_single_occurrence(event: Event, original_start: datetime) -> None:
    """
    Scope = "this only" delete: cancel a single occurrence, leaving the master
    series intact. Any existing per-occurrence override is soft-deleted.
    """
    with transaction.atomic():
        exc = (
            RecurrenceException.objects.filter(
                organization=event.organization,
                recurrence_rule=event.recurrence_rule,
                original_event=event,
                exception_date=original_start,
            )
            .select_related("modified_event")
            .first()
        )

        if exc:
            if exc.modified_event_id:
                exc.modified_event.is_deleted = True
                exc.modified_event.save(update_fields=["is_deleted", "updated_at"])
            exc.modified_event = None
            exc.is_cancelled = True
            exc.save()
        else:
            RecurrenceException.objects.create(
                organization=event.organization,
                recurrence_rule=event.recurrence_rule,
                original_event=event,
                exception_date=original_start,
                is_cancelled=True,
                modified_event=None,
            )


def split_series_from_occurrence(
    event: Event, original_start: datetime, data: dict, context: dict
) -> Event:
    """
    Scope = "this and future": Google-style split. Cap the master series just
    before `original_start`, then create a NEW recurring Event + RecurrenceRule
    starting at `original_start` carrying the edited values.

    ATOMICITY: every write below — capping the master rule, creating the new
    rule/event, re-pointing future exceptions, and copying attendees/reminders —
    runs inside a SINGLE transaction. The master cap is never committed on its
    own, so a failure mid-split can never leave a "master capped but new series
    missing" (data-loss) state.
    """
    from .serializers import EventCreateUpdateSerializer

    master_rule = event.recurrence_rule

    with transaction.atomic():
        # Snapshot original bounding before we mutate the master rule.
        original_count = master_rule.count
        original_until = master_rule.until
        occurrences_before = _count_occurrences_before(
            event.start_datetime, original_start, master_rule
        )

        # --- Cap the master rule (inside the transaction) ---------------------
        # The count/until CheckConstraint forbids setting both, so we mirror
        # whichever bound the master already used.
        if original_count is not None:
            master_rule.count = occurrences_before
            master_rule.until = None
        else:
            master_rule.until = original_start
            master_rule.count = None
        master_rule.save()

        # --- Build the new rule for the future series -------------------------
        if original_count is not None:
            new_count = max(original_count - occurrences_before, 0)
            new_until = None
        else:
            new_count = None
            new_until = original_until  # keep the original end (may be None)

        new_rule = RecurrenceRule.objects.create(
            organization=event.organization,
            frequency=master_rule.frequency,
            interval=master_rule.interval,
            by_day=list(master_rule.by_day or []),
            by_month_day=list(master_rule.by_month_day or []),
            by_set_pos=list(master_rule.by_set_pos or []),
            by_month=list(master_rule.by_month or []),
            count=new_count,
            until=new_until,
            exception_dates=list(master_rule.exception_dates or []),
        )

        # --- Create the new series master event -------------------------------
        new_event = Event.objects.get(pk=event.pk)
        new_event.pk = None
        new_event.id = uuid.uuid4()
        new_event.ical_uid = None
        new_event.is_recurring = True
        new_event.recurrence_rule = new_rule
        new_event.original_start = None
        new_event.is_deleted = False
        duration = event.end_datetime - event.start_datetime
        new_event.start_datetime = original_start
        new_event.end_datetime = original_start + duration
        new_event.metadata = {
            **(event.metadata or {}),
            "split_from": str(event.id),
            "split_at": original_start.isoformat(),
        }
        new_event.save()

        # Apply the edited values onto the new series master.
        payload = _sanitized_scope_payload(data)
        if payload:
            serializer = EventCreateUpdateSerializer(
                new_event,
                data=payload,
                partial=True,
                context=context,
            )
            serializer.is_valid(raise_exception=True)
            new_event = serializer.save()

        # --- Re-point future per-occurrence overrides to the new series -------
        # Exceptions strictly before the split stay on the (capped) master.
        RecurrenceException.objects.filter(
            organization=event.organization,
            recurrence_rule=master_rule,
            original_event=event,
            exception_date__gte=original_start,
        ).update(recurrence_rule=new_rule, original_event=new_event)

        # --- Copy attendees and reminders onto the new series -----------------
        for attendee in EventAttendee.objects.filter(event=event, is_deleted=False):
            attendee.pk = None
            attendee.id = uuid.uuid4()
            attendee.event = new_event
            attendee.save()

        for reminder in EventReminder.objects.filter(event=event, is_deleted=False):
            reminder.pk = None
            reminder.id = uuid.uuid4()
            reminder.event = new_event
            reminder.save()

        return new_event


def update_entire_series(event: Event, data: dict, context: dict) -> Event:
    """
    Scope = "all": edit the whole series by updating the master event. Thin
    wrapper around the create/update serializer so all three scopes share one
    home in services.py. The "all" HTTP path also reuses the existing
    PATCH /events/{id}/ endpoint, which delegates to the same serializer.
    """
    from .serializers import EventCreateUpdateSerializer

    with transaction.atomic():
        serializer = EventCreateUpdateSerializer(
            event,
            data=data,
            partial=True,
            context=context,
        )
        serializer.is_valid(raise_exception=True)
        return serializer.save()