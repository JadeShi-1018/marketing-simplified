import logging
from django.db import models

logger = logging.getLogger(__name__)

class Plan(models.Model):
    name = models.CharField(max_length=255, null=False, blank=False)
    desc = models.TextField(null=True, blank=True)
    max_team_members = models.IntegerField(null=False, blank=False)
    max_previews_per_day = models.IntegerField(null=False, blank=False)
    max_tasks_per_day = models.IntegerField(null=False, blank=False)
    stripe_price_id = models.CharField(max_length=255, null=True, blank=False)

    def __str__(self):
        return self.name

class Subscription(models.Model):
    organization = models.ForeignKey('core.Organization', on_delete=models.CASCADE, null=False, blank=False)
    plan = models.ForeignKey(Plan, on_delete=models.CASCADE, null=False, blank=False)
    stripe_subscription_id = models.CharField(max_length=255, null=False, blank=False)
    start_date = models.DateTimeField(null=False, blank=False)
    end_date = models.DateTimeField(null=False, blank=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['organization'],
                condition=models.Q(is_active=True, is_internal=False),
                name='unique_active_real_subscription_per_org',
            )
        ]

class UsageDaily(models.Model):
    user = models.ForeignKey('core.CustomUser', on_delete=models.CASCADE, null=False, blank=False)
    date = models.DateField(null=False, blank=False)
    previews_used = models.IntegerField(default=0, null=False, blank=False)
    tasks_used = models.IntegerField(default=0, null=False, blank=False)

class Payment(models.Model):
    user = models.ForeignKey('core.CustomUser', on_delete=models.CASCADE, null=False, blank=False)
    stripe_invoice_id = models.CharField(max_length=255, null=False, blank=False)
    stripe_subscription_id = models.CharField(max_length=255, null=False, blank=False)
    stripe_product_id = models.CharField(max_length=255, null=False, blank=False)
    stripe_price_id = models.CharField(max_length=255, null=False, blank=False)
    stripe_customer_id = models.CharField(max_length=255, null=False, blank=False)
    is_active = models.BooleanField(default=True)


class StripeWebhookEvent(models.Model):
    stripe_event_id = models.CharField(max_length=255, unique=True)
    event_type = models.CharField(max_length=100)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
