import logging

import stripe
from celery import shared_task
from django.conf import settings
from django.core.mail import mail_admins
from django.db.models import Sum
from django.utils import timezone

from .models import UsageDaily, UsageMonthly, Subscription, LLMCallLog, OrgMonthlyCost

logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY


@shared_task
def report_overage_to_stripe():
    """
    Report accumulated overage tokens to Stripe via the Billing Meter Events API.
    Run once per month (e.g. last day at 23:00 UTC via Celery Beat).

    Idempotency — two layers:
      1. Local: skip rows where overage_reported_at is already set (guard against reruns).
      2. Remote: Stripe deduplicates MeterEvents with the same identifier within a window.
    """
    ym = timezone.now().strftime('%Y-%m')

    for sub in (
        Subscription.objects.filter(is_active=True, is_internal=False)
        .select_related('plan', 'organization')
    ):
        usage = UsageMonthly.objects.filter(
            organization=sub.organization, year_month=ym,
        ).first()

        if not usage:
            continue
        if usage.overage_tokens == 0:
            continue
        if usage.overage_reported_at is not None:
            continue

        units = usage.overage_tokens // 1_000_000
        if units <= 0:
            continue

        cid = sub.organization.stripe_customer_id
        if not cid:
            logger.error(
                'report_overage_to_stripe: org %s has no stripe_customer_id — skipping',
                sub.organization_id,
            )
            continue

        try:
            stripe.billing.MeterEvent.create(
                event_name='token_overage',
                payload={'value': str(units), 'stripe_customer_id': cid},
                identifier=f'{sub.organization_id}-{ym}-overage',
                timestamp=int(timezone.now().timestamp()),
            )
            usage.overage_reported_at = timezone.now()
            usage.save(update_fields=['overage_reported_at'])
        except stripe.InvalidRequestError as e:
            if 'already exists' in str(e):
                # Stripe idempotency hit: the event was already received on a prior run.
                # Treat as success so the local guard is set and reruns stop hammering Stripe.
                usage.overage_reported_at = timezone.now()
                usage.save(update_fields=['overage_reported_at'])
                logger.info(
                    'report_overage_to_stripe: idempotent hit for org %s — marking reported',
                    sub.organization_id,
                )
            else:
                logger.exception(
                    'report_overage_to_stripe: overage report failed for org %s',
                    sub.organization_id,
                )
        except Exception:
            logger.exception(
                'report_overage_to_stripe: overage report failed for org %s',
                sub.organization_id,
            )


def _send_alert_email(org, tier: str, cost_cents: int, revenue_cents: int) -> None:
    """Send a fair-use alert email to site admins and log a WARNING."""
    ym = timezone.now().strftime('%Y-%m')
    if tier == 'free':
        subject = f'[Fair-Use Alert] Free org {org.name} (id={org.id}) cost ${cost_cents/100:.2f} in {ym}'
        message = (
            f'Organization: {org.name} (id={org.id})\n'
            f'Month: {ym}\n'
            f'LLM cost: ${cost_cents/100:.2f}\n'
            f'Threshold: ${getattr(settings, "FREE_USER_MAX_COST_CENTS", 500)/100:.2f}\n'
        )
    else:
        ratio = cost_cents / revenue_cents
        subject = f'[Fair-Use Alert] Paid org {org.name} (id={org.id}) ratio={ratio:.2f} in {ym}'
        message = (
            f'Organization: {org.name} (id={org.id})\n'
            f'Month: {ym}\n'
            f'LLM cost: ${cost_cents/100:.2f}\n'
            f'Plan revenue: ${revenue_cents/100:.2f}\n'
            f'Ratio: {ratio:.2f} (threshold={getattr(settings, "FAIR_USE_THRESHOLD_RATIO", 0.8)})\n'
        )
    logger.warning(
        'fair_use_alert org=%s tier=%s cost_cents=%d revenue_cents=%d',
        org.id, tier, cost_cents, revenue_cents,
    )
    try:
        mail_admins(subject, message, fail_silently=True)
    except Exception:
        logger.exception('_send_alert_email mail_admins failed for org %s', org.id)


@shared_task
def aggregate_monthly_llm_cost():
    """
    Aggregate LLMCallLog(success=True) into OrgMonthlyCost for the current month.
    Runs daily at 02:00 UTC; idempotent — update_or_create overwrites previous aggregation.
    """
    ym = timezone.now().strftime('%Y-%m')
    year = int(ym[:4])
    month = int(ym[5:7])

    rows = (
        LLMCallLog.objects.filter(
            success=True,
            created_at__year=year,
            created_at__month=month,
        )
        .values('organization_id')
        .annotate(
            agg_cost=Sum('total_cost_cents'),
            agg_tokens=Sum('normalized_tokens'),
        )
    )

    updated = 0
    for row in rows:
        OrgMonthlyCost.objects.update_or_create(
            organization_id=row['organization_id'],
            year_month=ym,
            defaults={
                'llm_cost_cents': row['agg_cost'] or 0,
                'total_tokens': row['agg_tokens'] or 0,
            },
        )
        updated += 1

    logger.info('aggregate_monthly_llm_cost done ym=%s orgs_updated=%d', ym, updated)


@shared_task
def check_fair_use_alerts():
    """
    Check OrgMonthlyCost against fair-use thresholds and alert admins when exceeded.

    Free orgs (no real is_internal=False subscription):
      cost > FREE_USER_MAX_COST_CENTS → alert

    Paid orgs:
      cost / monthly_revenue_cents > FAIR_USE_THRESHOLD_RATIO → alert

    v1: warning log + email to ADMINS. No automatic blocking.
    """
    ym = timezone.now().strftime('%Y-%m')
    free_max = getattr(settings, 'FREE_USER_MAX_COST_CENTS', 500)
    ratio_threshold = getattr(settings, 'FAIR_USE_THRESHOLD_RATIO', 0.8)

    alerts = 0
    for cost_row in OrgMonthlyCost.objects.filter(year_month=ym).select_related('organization'):
        org = cost_row.organization
        cost = cost_row.llm_cost_cents

        sub = (
            Subscription.objects.filter(organization=org, is_active=True, is_internal=False)
            .first()
        )

        if not sub:
            if cost > free_max:
                _send_alert_email(org, 'free', cost, 0)
                alerts += 1
        else:
            revenue = sub.monthly_revenue_cents or 0
            if revenue == 0:
                if cost > free_max:
                    _send_alert_email(org, 'free', cost, 0)
                    alerts += 1
            else:
                ratio = cost / revenue
                if ratio > ratio_threshold:
                    _send_alert_email(org, 'paid', cost, revenue)
                    alerts += 1

    logger.info('check_fair_use_alerts done ym=%s alerts_sent=%d', ym, alerts)


@shared_task
def reset_daily_usage():
    """
    Reset daily usage records at midnight every day.
    This task should be scheduled to run daily at 00:00 UTC.
    """
    try:
        # Get current date
        today = timezone.now().date()
        
        # Delete all usage records (they will be recreated as needed)
        deleted_count, _ = UsageDaily.objects.all().delete()
        
        logger.info(f"Daily usage reset completed. Deleted {deleted_count} records at {today}")
        
        return {
            'status': 'success',
            'deleted_records': deleted_count,
            'reset_date': today.isoformat(),
            'message': f'Successfully reset {deleted_count} daily usage records'
        }
        
    except Exception as e:
        logger.error(f"Error resetting daily usage: {e}")
        return {
            'status': 'error',
            'error': str(e),
            'message': 'Failed to reset daily usage records'
        }
