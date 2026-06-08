import logging

import stripe
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from core.models import CustomUser
from stripe_meta.exceptions import QuotaError
from stripe_meta.models import UsageMonthly, Subscription

logger = logging.getLogger(__name__)


def resolve_charging_org(agent_session):
    """
    PM decision Q18: AI quota is charged to the Project's Organization, not the user's.
    Fail-closed: if the project has no linked Org (SET_NULL orphan), raise QuotaError.
    Rationale: metering must never silently charge the wrong account.
    """
    if agent_session and agent_session.project_id:
        org = agent_session.project.organization
        if org is not None:
            return org

    logger.warning(
        "Cannot resolve charging org for session %s — project has no organization (orphan)",
        getattr(agent_session, 'id', '<none>'),
    )
    raise QuotaError(
        code='PROJECT_HAS_NO_ORG',
        message='This project is not linked to an organization. Please contact your admin.',
    )


def estimate_input_tokens(text: str, model: str) -> int:
    """
    V1 rough estimate: English ~1 word = 1.3 tokens; CJK ~1 char = 2 tokens.
    Replace with provider tokenizer in v2.
    """
    word_count = len(text.split())
    cjk_count = sum(1 for c in text if '一' <= c <= '鿿')
    return int(word_count * 1.3 + cjk_count * 2)


def _get_or_create_usage(organization, ym: str) -> UsageMonthly:
    obj, _ = UsageMonthly.objects.get_or_create(
        organization=organization,
        year_month=ym,
        defaults={'tokens_used': 0, 'tokens_reserved': 0},
    )
    return obj


def get_active_real_subscription(organization):
    """
    Return the active subscription, preferring real (is_internal=False) over the
    Free sentinel (is_internal=True). order_by('is_internal') sorts False(0) before
    True(1), so a real sub always wins when both are active.
    """
    return (
        Subscription.objects.filter(organization=organization, is_active=True)
        .order_by('is_internal')
        .select_related('plan')
        .first()
    )


def reserve_quota(organization, tokens: int) -> None:
    """Atomically pre-reserve tokens before an LLM call starts."""
    ym = timezone.now().strftime('%Y-%m')
    _get_or_create_usage(organization, ym)
    UsageMonthly.objects.filter(organization=organization, year_month=ym).update(
        tokens_reserved=F('tokens_reserved') + tokens,
    )


def commit_quota(organization, actual_tokens: int, reserved_tokens: int) -> None:
    """
    Reconcile after a successful LLM call:
      tokens_reserved -= reserved_tokens
      tokens_used     += actual_tokens
      overage_tokens  += delta (Team metered billing accumulator)
    Uses select_for_update to prevent lost-update races.
    """
    ym = timezone.now().strftime('%Y-%m')
    sub = get_active_real_subscription(organization)
    quota = sub.plan.monthly_token_quota if sub and sub.plan else None

    with transaction.atomic():
        row = UsageMonthly.objects.select_for_update().get(
            organization=organization, year_month=ym,
        )
        before_used = row.tokens_used
        new_used = before_used + actual_tokens
        overage_delta = 0
        if quota is not None and new_used > quota:
            overage_delta = max(0, new_used - max(before_used, quota))
        UsageMonthly.objects.filter(pk=row.pk).update(
            tokens_reserved=F('tokens_reserved') - reserved_tokens,
            tokens_used=F('tokens_used') + actual_tokens,
            overage_tokens=F('overage_tokens') + overage_delta,
        )


def release_quota(organization, tokens: int) -> None:
    """Return reserved tokens when an LLM call fails (failed calls are not billed)."""
    ym = timezone.now().strftime('%Y-%m')
    UsageMonthly.objects.filter(organization=organization, year_month=ym).update(
        tokens_reserved=F('tokens_reserved') - tokens,
    )


def check_quota_or_402(organization, requested_tokens: int):
    """
    Return (allowed: bool, error_payload: dict | None).

    Checks in order:
      1. Per-call cap (SINGLE_CALL_TOO_LARGE) — applies to all plans.
      2. Monthly quota (TOKEN_QUOTA_EXCEEDED) — only blocks Free (no overage);
         Team always passes and accumulates overage for Stripe metered billing.

    All arithmetic is integer-only.
    """
    sub = get_active_real_subscription(organization)
    if not sub:
        return True, None   # no subscription found — do not block

    plan = sub.plan

    # 1. Per-call cap
    if plan.max_tokens_per_call and requested_tokens > plan.max_tokens_per_call:
        return False, {
            'code': 'SINGLE_CALL_TOO_LARGE',
            'message': 'Single call exceeds the per-call token limit for your plan',
            'requested': requested_tokens,
            'limit': plan.max_tokens_per_call,
            'upgrade_url': '/plans',
        }

    # 2. Monthly quota
    quota = plan.monthly_token_quota
    if quota is None:
        return True, None   # unlimited

    ym = timezone.now().strftime('%Y-%m')
    row = UsageMonthly.objects.filter(organization=organization, year_month=ym).first()
    used = (row.tokens_used + row.tokens_reserved) if row else 0

    overage_allowed = plan.overage_price_cents_per_1m is not None
    if used + requested_tokens > quota and not overage_allowed:
        return False, {
            'code': 'TOKEN_QUOTA_EXCEEDED',
            'message': 'Free plan monthly token quota exceeded',
            'current_usage': used,
            'limit': quota,
            'year_month': ym,
            'upgrade_url': '/plans',
        }

    return True, None


def sync_seat_count(organization) -> None:
    """
    Sync the extra-seat line-item quantity on the org's active Stripe subscription
    to match the current user count.

    Free orgs (no real subscription, or plan without stripe_extra_seat_price_id)
    are skipped silently — Stripe is not involved.

    The select_for_update row-lock prevents concurrent syncs racing each other
    (e.g. bulk invite + simultaneous remove).
    """
    sub = (
        Subscription.objects.filter(
            organization=organization,
            is_active=True,
            is_internal=False,
        )
        .select_related('plan')
        .first()
    )
    if not sub or not sub.plan.stripe_extra_seat_price_id:
        return

    plan = sub.plan
    seat_count = CustomUser.objects.filter(organization=organization).count()
    extra_seats = max(0, seat_count - (plan.included_seats or 1))

    with transaction.atomic():
        locked_sub = Subscription.objects.select_for_update().get(pk=sub.pk)

        stripe_sub = stripe.Subscription.retrieve(locked_sub.stripe_subscription_id)
        extra_item = next(
            (
                item for item in stripe_sub['items']['data']
                if item['price']['id'] == plan.stripe_extra_seat_price_id
            ),
            None,
        )
        if not extra_item:
            if extra_seats == 0:
                # No extra-seat item exists and none needed — sync local count only
                Subscription.objects.filter(pk=locked_sub.pk).update(seat_count=seat_count)
                return
            # Add the extra-seat item for the first time (e.g. 5-seat-start team adds 6th member)
            item_patch = {'price': plan.stripe_extra_seat_price_id, 'quantity': extra_seats}
        else:
            item_patch = {'id': extra_item['id'], 'quantity': extra_seats}

        stripe.Subscription.modify(
            locked_sub.stripe_subscription_id,
            items=[item_patch],
            proration_behavior='create_prorations',
        )
        Subscription.objects.filter(pk=locked_sub.pk).update(seat_count=seat_count)

    logger.info(
        "sync_seat_count org=%s sub=%s seat_count=%d extra_seats=%d",
        organization.id,
        locked_sub.stripe_subscription_id,
        seat_count,
        extra_seats,
    )
