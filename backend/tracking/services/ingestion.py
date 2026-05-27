import logging
import time
import uuid

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from pydantic import ValidationError

from tracking import metrics as _metrics
from tracking.models import TrackingEvent
from tracking.schema_registry import registry
from tracking.services.session_lookup import SessionLookup

logger = logging.getLogger(__name__)


def ingest_event(
    *,
    source,
    event_type,
    user,
    metadata,
    target=None,
    occurred_at=None,
    session=None,
    client_event_id=None,
):
    """
    Unified entry point for all tracking event writes.

    source: Source enum value (MIDDLEWARE / EXPLICIT / CLIENT)
    event_type: EventType enum value
    user: User instance
    metadata: dict — validated against registered schema before write
    target: optional Django model instance for the generic FK (content_type / object_id)
    occurred_at: datetime; defaults to now
    session: TrackingSession instance or session-id string; auto-created when None
    client_event_id: UUID; auto-generated when None (unique_together dedup key)

    Returns the TrackingEvent instance on success, None when validation drops the event.
    reason labels: ok (inserted) | schema_invalid (validation failed) | duplicate (deduped)
    """
    _t0 = time.perf_counter()

    # 1. Schema validation — drops the event on failure, emits metric, never raises.
    try:
        metadata = registry.validate(event_type, metadata)
    except ValidationError as exc:
        logger.warning(
            "ingest_event: payload dropped — event_type=%r validation failed: %s",
            event_type,
            exc,
        )
        _metrics.tracking_events_total.labels(
            source=str(source), event_type=str(event_type), reason='schema_invalid'
        ).inc()
        return None

    # 2. Resolve session (all three Source branches share this path).
    if session is not None:
        session_id = str(session.pk) if hasattr(session, 'pk') else str(session)
    else:
        user_agent = metadata.get('user_agent', '') if isinstance(metadata, dict) else ''
        session_id = SessionLookup().get_or_create_session(user.pk, user_agent)

    # 3. Resolve content_type / object_id from target (optional).
    if target is not None:
        ct = ContentType.objects.get_for_model(target)
        object_id = target.pk
    else:
        ct = None
        object_id = None

    # 4. Insert with idempotent dedup via get_or_create on the (user, client_event_id)
    #    unique key. created=False → 'duplicate' metric; created=True → 'ok'.
    _client_event_id = client_event_id or uuid.uuid4()
    event, created = TrackingEvent.objects.get_or_create(
        user=user,
        client_event_id=_client_event_id,
        defaults={
            'session_id': session_id,
            'content_type': ct,
            'object_id': object_id,
            'event_type': event_type,
            'source': source,
            'occurred_at': occurred_at or timezone.now(),
            'metadata': metadata if isinstance(metadata, dict) else {},
            'project_id': metadata.get('project_id') if isinstance(metadata, dict) else None,
        },
    )

    reason = 'ok' if created else 'duplicate'
    _metrics.tracking_events_total.labels(
        source=str(source), event_type=str(event_type), reason=reason
    ).inc()
    _metrics.tracking_ingest_latency_seconds.labels(source=str(source)).observe(
        time.perf_counter() - _t0
    )
    return event
