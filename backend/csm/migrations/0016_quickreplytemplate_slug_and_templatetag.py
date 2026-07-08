from django.db import migrations, models
import django.db.models.deletion

from core.slug_backfill import backfill_slugs


def backfill_quickreplytemplate(apps, schema_editor):
    backfill_slugs(apps.get_model('csm', 'QuickReplyTemplate'), source_field='title')


def seed_template_tags_from_existing(apps, schema_editor):
    """Seed the admin-managed tag vocabulary from tags already on templates.

    Tags are an admin-managed allowlist (MED-213). To avoid breaking edits on
    templates that predate the vocabulary, copy every distinct tag string onto
    a TemplateTag row for its organisation. No-op when no templates exist.
    """
    QuickReplyTemplate = apps.get_model('csm', 'QuickReplyTemplate')
    TemplateTag = apps.get_model('csm', 'TemplateTag')
    for tmpl in QuickReplyTemplate.objects.exclude(tags=[]):
        for raw in (tmpl.tags or []):
            name = str(raw).strip().lower()
            if name:
                TemplateTag.objects.get_or_create(
                    organisation_id=tmpl.organisation_id, name=name,
                )


class Migration(migrations.Migration):

    dependencies = [
        ('csm', '0015_merge_sla_and_support_channels'),
        ('customer', '__first__'),
    ]

    operations = [
        # --- QuickReplyTemplate slug (SMP-539 three-step pattern) ---
        migrations.AddField(
            model_name='quickreplytemplate',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(backfill_quickreplytemplate, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='quickreplytemplate',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, unique=True),
        ),

        # --- TemplateTag ---
        migrations.CreateModel(
            name='TemplateTag',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('name', models.CharField(max_length=100)),
                ('organisation', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='template_tags',
                    to='customer.customerorganisation',
                )),
            ],
            options={
                'ordering': ['name'],
                'unique_together': {('organisation', 'name')},
            },
        ),
        # Seed the tag vocabulary from existing template tags so the new
        # admin-managed allowlist doesn't block edits on legacy templates.
        migrations.RunPython(seed_template_tags_from_existing, migrations.RunPython.noop),
    ]
