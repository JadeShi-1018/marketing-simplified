from django.db import migrations, models

from core.slug_backfill import backfill_slugs


def backfill_queue(apps, schema_editor):
    backfill_slugs(apps.get_model('csm', 'Queue'), source_field='name')


def backfill_ticketform(apps, schema_editor):
    backfill_slugs(apps.get_model('csm', 'TicketForm'), source_field='name')


class Migration(migrations.Migration):

    dependencies = [
        ('csm', '0008_ticket_form_file_field_type'),
    ]

    operations = [
        # Queue
        migrations.AddField(
            model_name='queue',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(backfill_queue, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='queue',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, unique=True),
        ),
        # TicketForm
        migrations.AddField(
            model_name='ticketform',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(backfill_ticketform, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='ticketform',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, unique=True),
        ),
    ]
