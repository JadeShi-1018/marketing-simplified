from django.db import migrations


def archive_legacy_plans(apps, schema_editor):
    Plan = apps.get_model('stripe_meta', 'Plan')
    Plan.objects.filter(name__in=['Pro', 'Ultimate']).update(is_archived=True)


def unarchive_legacy_plans(apps, schema_editor):
    Plan = apps.get_model('stripe_meta', 'Plan')
    Plan.objects.filter(name__in=['Pro', 'Ultimate']).update(is_archived=False)


class Migration(migrations.Migration):

    dependencies = [
        ('stripe_meta', '0005_usage_models'),
    ]

    operations = [
        migrations.RunPython(archive_legacy_plans, reverse_code=unarchive_legacy_plans),
    ]
