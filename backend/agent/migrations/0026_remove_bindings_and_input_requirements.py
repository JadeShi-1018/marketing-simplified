from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0025_phase2_template_input_requirements_trigger_modes'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='agentworkflowtemplate',
            name='input_requirements',
        ),
        migrations.DeleteModel(
            name='AgentProjectWorkflowBinding',
        ),
    ]
