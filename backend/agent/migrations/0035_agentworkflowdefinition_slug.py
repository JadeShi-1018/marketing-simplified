from django.db import migrations, models

from core.slug_backfill import backfill_slugs


def backfill(apps, schema_editor):
    backfill_slugs(apps.get_model('agent', 'AgentWorkflowDefinition'), source_field='name')


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0034_merge_20260614_2345'),
    ]

    operations = [
        migrations.AddField(
            model_name='agentworkflowdefinition',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='agentworkflowdefinition',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, unique=True),
        ),
    ]
