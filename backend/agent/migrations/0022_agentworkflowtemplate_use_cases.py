from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0021_agentworkflowtemplate_projects_m2m'),
    ]

    operations = [
        migrations.AddField(
            model_name='agentworkflowtemplate',
            name='use_cases',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text=(
                    'Example scenarios when to use this workflow (list of strings). '
                    'Used by the AI intent router to match user messages to this template.'
                ),
            ),
        ),
    ]
