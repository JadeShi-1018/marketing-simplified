"""SMP-539 Batch H: add a human-readable slug to facebook_meta.AdCreative.

3-step (AddField nullable+unique -> backfill -> AlterField not-null) so it is
safe on tables that already hold data. Creative names may be blank or
duplicated, so backfill_slugs falls back to `adcreative-<uuid8>` and
de-duplicates with a numeric suffix.
"""
from django.db import migrations, models

from core.slug_backfill import backfill_slugs


def backfill_creative(apps, schema_editor):
    backfill_slugs(apps.get_model("facebook_meta", "AdCreative"), source_field="name")


class Migration(migrations.Migration):

    dependencies = [
        ("facebook_meta", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="adcreative",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(backfill_creative, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="adcreative",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, unique=True),
        ),
    ]
