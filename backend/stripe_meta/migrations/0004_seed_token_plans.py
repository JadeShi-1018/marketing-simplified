import os
from django.db import migrations


def seed_token_plans(apps, schema_editor):
    """Seed Free and Team plans with token-billing fields. Idempotent via update_or_create."""
    Plan = apps.get_model('stripe_meta', 'Plan')

    Plan.objects.update_or_create(
        name='Free',
        defaults={
            'desc': 'Free plan — 500K tokens/month, 1 seat, hard block on quota exhaustion',
            'base_price_cents': 0,
            'included_seats': 1,
            'extra_seat_price_cents': None,
            'monthly_token_quota': 500_000,
            'overage_price_cents_per_1m': None,   # None = hard block, no overage
            'max_tokens_per_call': 50_000,
            'stripe_price_id': None,
            'stripe_extra_seat_price_id': None,
            'stripe_overage_price_id': None,
            'is_archived': False,
        },
    )

    Plan.objects.update_or_create(
        name='Team',
        defaults={
            'desc': 'Team plan — 5M tokens/month, 5 seats ($49/mo), metered overage at $5/1M',
            'base_price_cents': 4900,
            'included_seats': 5,
            'extra_seat_price_cents': 900,
            'monthly_token_quota': 5_000_000,
            'overage_price_cents_per_1m': 500,
            'max_tokens_per_call': 500_000,
            'stripe_price_id': os.environ.get('STRIPE_TEAM_BASE_PRICE_ID', ''),
            'stripe_extra_seat_price_id': os.environ.get('STRIPE_TEAM_EXTRA_SEAT_PRICE_ID', ''),
            'stripe_overage_price_id': os.environ.get('STRIPE_TEAM_OVERAGE_PRICE_ID', ''),
            'is_archived': False,
        },
    )
    # Pro and Ultimate rows are left untouched; commit 16 archives them.


def reverse_seed_token_plans(apps, schema_editor):
    Plan = apps.get_model('stripe_meta', 'Plan')
    Plan.objects.filter(name__in=['Free', 'Team']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('stripe_meta', '0003_token_billing'),
    ]

    operations = [
        migrations.RunPython(seed_token_plans, reverse_seed_token_plans),
    ]
