import logging

import stripe
from celery import shared_task
from django.conf import settings
from django.utils import timezone

from .models import UsageDaily, UsageMonthly, Subscription

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
        except Exception:
            logger.exception(
                'report_overage_to_stripe: overage report failed for org %s',
                sub.organization_id,
            )


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
