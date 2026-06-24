"""Add a human-readable slug to google_ads.Ad.

3-step (AddField nullable+unique -> backfill -> AlterField not-null) so it is
safe on tables that already hold data. `Ad.name` is unique but may be blank, so
backfill_slugs falls back to `ad-<uuid8>` and de-duplicates with a numeric
suffix.
"""
from django.db import migrations, models

from core.slug_backfill import backfill_slugs


def backfill_ad(apps, schema_editor):
    backfill_slugs(apps.get_model("google_ads", "Ad"), source_field="name")


class Migration(migrations.Migration):

    dependencies = [
        ("google_ads", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="ad",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(backfill_ad, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="ad",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, unique=True),
        ),
    ]
