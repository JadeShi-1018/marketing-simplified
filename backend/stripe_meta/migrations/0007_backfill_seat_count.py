from django.db import migrations


def backfill_seat_count(apps, schema_editor):
    """
    Backfill seat_count for existing paid (non-internal) subscriptions that have
    seat_count=0 (the column default before Model B was introduced).  Sets them
    to plan.included_seats (floor), which is the minimum valid value under Model B.
    Internal (sentinel) subscriptions are already correct (seat_count=1 via 0002).
    """
    Subscription = apps.get_model('stripe_meta', 'Subscription')
    for sub in (
        Subscription.objects
        .filter(is_internal=False, seat_count=0)
        .select_related('plan')
    ):
        sub.seat_count = sub.plan.included_seats or 1
        sub.save(update_fields=['seat_count'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('stripe_meta', '0006_archive_legacy_plans'),
    ]

    operations = [
        migrations.RunPython(backfill_seat_count, reverse_code=noop),
    ]
