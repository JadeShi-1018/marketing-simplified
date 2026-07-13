"""
Service layer for OrganizationActivityEvent.

Public API:
  log_org_activity(org, event_type, *, actor=None, target_user=None, metadata=None)
  get_recent_org_activity(org_id, limit=20) -> QuerySet[OrganizationActivityEvent]
  build_human_readable(event) -> str
"""

from __future__ import annotations

import logging

from django.db import IntegrityError

logger = logging.getLogger(__name__)

# Import lazily inside functions to avoid circular imports at module load time.


def log_org_activity(
    org,
    event_type: str,
    *,
    actor=None,
    target_user=None,
    metadata: dict | None = None,
) -> None:
    """
    Append a new activity event for an organization.

    Silently ignores duplicate token-threshold events for the same
    org / year_month / threshold combo (stored in metadata).
    """
    from core.models import OrganizationActivityEvent  # noqa: PLC0415

    meta = metadata or {}

    # De-duplicate token threshold events: only one per org/month/threshold.
    if event_type in (
        OrganizationActivityEvent.EventType.TOKEN_QUOTA_WARNING,
        OrganizationActivityEvent.EventType.TOKEN_QUOTA_EXCEEDED,
        OrganizationActivityEvent.EventType.TOKEN_OVERAGE_STARTED,
    ):
        year_month = meta.get('year_month')
        threshold = meta.get('threshold')
        if year_month and threshold is not None:
            already_exists = OrganizationActivityEvent.objects.filter(
                organization=org,
                event_type=event_type,
                metadata__year_month=year_month,
                metadata__threshold=threshold,
            ).exists()
            if already_exists:
                return

    try:
        OrganizationActivityEvent.objects.create(
            organization=org,
            event_type=event_type,
            actor=actor,
            target_user=target_user,
            metadata=meta,
        )
    except IntegrityError:
        logger.warning(
            "log_org_activity: IntegrityError for org=%s event_type=%s",
            getattr(org, 'id', org),
            event_type,
        )
    except Exception:
        logger.exception(
            "log_org_activity: unexpected error for org=%s event_type=%s",
            getattr(org, 'id', org),
            event_type,
        )


def get_recent_org_activity(org_id: int, limit: int = 20):
    """Return the most recent activity events for an org, with related users pre-fetched."""
    from core.models import OrganizationActivityEvent  # noqa: PLC0415

    limit = min(limit, 50)
    return (
        OrganizationActivityEvent.objects.filter(organization_id=org_id)
        .select_related('actor', 'target_user')
        .order_by('-created_at')[:limit]
    )


def build_human_readable(event) -> str:
    """
    Build a short English sentence describing an activity event.
    Falls back to the event_type label if no template matches.
    """
    et = event.event_type
    meta = event.metadata or {}
    actor_name = _display_name(event.actor)
    target_name = _display_name(event.target_user)

    if et == 'member_joined':
        role = meta.get('role', 'member').capitalize()
        return f"{target_name} joined as {role}"

    if et == 'member_removed':
        return f"{actor_name} removed {target_name}"

    if et == 'member_left':
        return f"{target_name} left the organization"

    if et == 'plan_subscribed':
        plan = meta.get('plan_name', 'a plan')
        return f"Subscribed to {plan} plan"

    if et == 'plan_changed':
        old = meta.get('old_plan', '')
        new = meta.get('new_plan', '')
        if old and new:
            return f"Plan changed from {old} to {new}"
        return f"Switched to {new or old or 'new plan'}"

    if et == 'plan_cancel_scheduled':
        return "Plan set to cancel at period end"

    if et == 'plan_reactivated':
        return "Auto-renew re-enabled"

    if et == 'seats_changed':
        old = meta.get('old_seats')
        new = meta.get('new_seats')
        if old is not None and new is not None:
            direction = 'increased' if new > old else 'decreased'
            return f"Seats {direction} from {old} to {new}"
        return f"Seats updated to {new or meta.get('seat_count', '?')}"

    if et == 'plan_cancelled':
        return "Subscription cancelled"

    if et == 'token_quota_warning':
        pct = meta.get('threshold', '')
        return f"{pct}% of monthly token quota used"

    if et == 'token_quota_exceeded':
        return "Monthly token quota exceeded"

    if et == 'token_overage_started':
        extra = meta.get('overage_tokens')
        if extra:
            return f"Overage billing started (+{_fmt_tokens(extra)} tokens)"
        return "Overage billing started"

    return et.replace('_', ' ').capitalize()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _display_name(user) -> str:
    if user is None:
        return 'System'
    return getattr(user, 'name', None) or getattr(user, 'username', None) or 'Unknown'


def _fmt_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.0f}K"
    return str(n)
