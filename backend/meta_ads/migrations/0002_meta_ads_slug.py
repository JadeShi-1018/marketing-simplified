"""Add human-readable slugs to Meta ad resources.

3-step per model (AddField nullable+unique -> backfill -> AlterField not-null)
so it is safe to apply on tables that already hold data. Ad names are often
blank or duplicated, so backfill_slugs falls back to `metacampaign-<uuid8>` and
de-duplicates with a numeric suffix.
"""
from django.db import migrations, models

from core.slug_backfill import backfill_slugs


def backfill_campaign(apps, schema_editor):
    backfill_slugs(apps.get_model("meta_ads", "MetaCampaign"), source_field="name")


def backfill_adset(apps, schema_editor):
    backfill_slugs(apps.get_model("meta_ads", "MetaAdSet"), source_field="name")


def backfill_creative(apps, schema_editor):
    backfill_slugs(apps.get_model("meta_ads", "MetaAdCreative"), source_field="name")


class Migration(migrations.Migration):

    dependencies = [
        ("meta_ads", "0001_initial"),
    ]

    operations = [
        # --- MetaCampaign ---
        migrations.AddField(
            model_name="metacampaign",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(backfill_campaign, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="metacampaign",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, unique=True),
        ),
        # --- MetaAdSet ---
        migrations.AddField(
            model_name="metaadset",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(backfill_adset, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="metaadset",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, unique=True),
        ),
        # --- MetaAdCreative ---
        migrations.AddField(
            model_name="metaadcreative",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(backfill_creative, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="metaadcreative",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, unique=True),
        ),
    ]
