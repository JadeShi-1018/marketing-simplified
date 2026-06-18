from django.db import migrations, models

from core.slug_backfill import backfill_slugs


def backfill(apps, schema_editor):
    backfill_slugs(apps.get_model('campaign', 'CampaignTemplate'), source_field='name')


class Migration(migrations.Migration):

    dependencies = [
        ('campaign', '0004_campaign_slug'),
    ]

    operations = [
        migrations.AddField(
            model_name='campaigntemplate',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='campaigntemplate',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, unique=True),
        ),
    ]
