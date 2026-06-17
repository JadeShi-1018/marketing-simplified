from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0023_rename_agent_tmpl_category_idx_agent_workf_categor_ac4dcd_idx_and_more'),
    ]

    operations = [
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
                    ('approval_request', 'Approval Request'),
                    ('follow_up_prompt', 'Follow-up Prompt'),
                    ('error', 'Error'),
                ],
                default='text',
                max_length=30,
            ),
        ),
    ]
