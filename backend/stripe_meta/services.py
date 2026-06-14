import logging
from datetime import datetime, timezone as datetime_timezone

import stripe
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from core.models import CustomUser
from stripe_meta.exceptions import QuotaError
from stripe_meta.models import UsageMonthly, Subscription

logger = logging.getLogger(__name__)


class InvoiceHistoryError(Exception):
    """Raised when Stripe invoice history cannot be loaded."""


def list_org_invoices(organization):
    """Return the organization's recent Stripe invoices as plain dictionaries."""
    customer_id = getattr(organization, 'stripe_customer_id', None)
    if not customer_id:
        return []

    try:
        invoices = stripe.Invoice.list(customer=customer_id, limit=24)
    except stripe.StripeError as exc:
        logger.warning(
            "Unable to load Stripe invoices for organization %s",
            getattr(organization, 'id', '<unknown>'),
        )
        raise InvoiceHistoryError('Unable to load invoice history') from exc

    return [
        {
            'id': invoice.get('id'),
            'number': invoice.get('number'),
            'created': datetime.fromtimestamp(
                invoice.get('created'), tz=datetime_timezone.utc,
            ).isoformat() if invoice.get('created') else None,
            'amount_paid_cents': invoice.get('amount_paid', 0),
            'currency': invoice.get('currency', '').upper(),
            'status': invoice.get('status'),
            'description': invoice.get('description'),
            'hosted_invoice_url': invoice.get('hosted_invoice_url'),
            'invoice_pdf': invoice.get('invoice_pdf'),
        }
        for invoice in invoices.data
    ]


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


def reserve_quota(organization, tokens: int) -> str:
    """
    Atomically pre-reserve tokens before an LLM call starts.

    Returns the year_month the reservation was written to. Callers MUST pass it
    back to commit_quota/release_quota — recomputing the month there would hit
    the wrong row for calls spanning midnight on the 1st (reserve in month A,
    commit in month B → month B driven negative, month A's reservation leaked).
    """
    ym = timezone.now().strftime('%Y-%m')
    _get_or_create_usage(organization, ym)
    UsageMonthly.objects.filter(organization=organization, year_month=ym).update(
        tokens_reserved=F('tokens_reserved') + tokens,
    )
    return ym


def commit_quota(organization, actual_tokens: int, reserved_tokens: int, year_month: str | None = None) -> None:
    """
    Reconcile after a successful LLM call:
      tokens_reserved -= reserved_tokens
      tokens_used     += actual_tokens
      overage_tokens  += delta (Team metered billing accumulator)
    Uses select_for_update to prevent lost-update races.

    year_month: the month returned by reserve_quota; defaults to the current
    month for callers without a reservation context.
    """
    ym = year_month or timezone.now().strftime('%Y-%m')
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


def release_quota(organization, tokens: int, year_month: str | None = None) -> None:
    """
    Return reserved tokens when an LLM call fails (failed calls are not billed).

    year_month: the month returned by reserve_quota; defaults to the current
    month for callers without a reservation context.
    """
    ym = year_month or timezone.now().strftime('%Y-%m')
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


def get_seat_availability(organization) -> tuple:
    """
    Return (purchased_seats, current_member_count) for the org.

    purchased_seats is None for Free-sentinel orgs (no seat cap applies).
    current_member_count is always the live DB count.
    Does not touch Stripe.
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
    purchased = sub.seat_count if sub else None
    members = CustomUser.objects.filter(organization=organization).count()
    return purchased, members
