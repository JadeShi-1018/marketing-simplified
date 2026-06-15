from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0020_agentworkflowtemplate_add_project_remove_share_scope'),
        ('core', '0003_add_user_profile_fields'),
    ]

    operations = [
        # 1. Remove old project FK index
        migrations.RemoveIndex(
            model_name='agentworkflowtemplate',
            name='agent_tmpl_project_idx',
        ),

        # 2. Remove old project FK column
        migrations.RemoveField(
            model_name='agentworkflowtemplate',
            name='project',
        ),

        # 3. Add M2M projects field
        migrations.AddField(
            model_name='agentworkflowtemplate',
            name='projects',
            field=models.ManyToManyField(
                blank=True,
                help_text='Members of any listed project can see this template',
                related_name='workflow_templates',
                to='core.project',
            ),
        ),
    ]
