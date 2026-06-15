from django.db import migrations, models


def migrate_message_keyword_to_intent_match(apps, schema_editor):
    Binding = apps.get_model('agent', 'AgentProjectWorkflowBinding')
    Binding.objects.filter(trigger_mode='message_keyword').update(
        trigger_mode='intent_match',
        trigger_keywords=[],
    )


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0024_agentmessage_workflow_confirm_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='agentworkflowtemplate',
            name='input_requirements',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    'What the user must provide before running: plain_text, file_upload, '
                    'spreadsheet flags plus optional notes (admin hint for AI routing).'
                ),
            ),
        ),
        migrations.AlterField(
            model_name='agentprojectworkflowbinding',
            name='trigger_mode',
            field=models.CharField(
                choices=[
                    ('intent_match', 'Intent Match'),
                    ('file_upload', 'File Upload'),
                    ('analyze_action', 'Analyze Action'),
                    ('manual_only', 'Manual Only'),
                    ('message_keyword', 'Message Keyword (Legacy)'),
                ],
                help_text='How this workflow should be triggered',
                max_length=20,
            ),
        ),
        migrations.RunPython(
            migrate_message_keyword_to_intent_match,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name='agentmessage',
            name='message_type',
            field=models.CharField(
                choices=[
                    ('text', 'Text'),
                    ('analysis', 'Analysis'),
                    ('decision_draft', 'Decision Draft'),
                    ('task_created', 'Task Created'),
                    ('confirmation_request', 'Confirmation Request'),
                    ('workflow_confirm', 'Workflow Confirm'),
                    ('workflow_choice', 'Workflow Choice'),
                    ('approval_request', 'Approval Request'),
                    ('follow_up_prompt', 'Follow-up Prompt'),
                    ('error', 'Error'),
                ],
                default='text',
                max_length=30,
            ),
        ),
    ]
