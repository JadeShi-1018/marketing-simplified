from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='agentworkflowrun',
            name='generation_outputs_requested',
            field=models.JSONField(
                blank=True,
                help_text='User-selected generation outputs for this run (upload-analyze).',
                null=True,
            ),
        ),
    ]
