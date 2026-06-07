from django.db import migrations


def fix_free_sentinel_ids(apps, schema_editor):
    """Make every Free sentinel stripe_subscription_id unique before the uniqueness constraint lands."""
    Subscription = apps.get_model('stripe_meta', 'Subscription')
    for sub in Subscription.objects.filter(stripe_subscription_id='sub_free_internal'):
        sub.stripe_subscription_id = f'sub_free_internal_{sub.organization_id}'
        sub.save()


def reverse_fix_free_sentinel_ids(apps, schema_editor):
    Subscription = apps.get_model('stripe_meta', 'Subscription')
    for sub in Subscription.objects.filter(stripe_subscription_id__startswith='sub_free_internal_'):
        sub.stripe_subscription_id = 'sub_free_internal'
        sub.save()


class Migration(migrations.Migration):

    dependencies = [
        ('stripe_meta', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(fix_free_sentinel_ids, reverse_fix_free_sentinel_ids),
    ]
