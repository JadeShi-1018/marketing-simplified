from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0019_fix_step_order_partial_unique'),
        ('core', '0003_add_user_profile_fields'),
    ]

    operations = [
        # 1. Add project FK (nullable)
        migrations.AddField(
            model_name='agentworkflowtemplate',
            name='project',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='workflow_templates',
                help_text='If set, all members of this project can see the template',
                to='core.project',
            ),
        ),

        # 2. Remove the old CheckConstraint (references share_scope)
        migrations.RemoveConstraint(
            model_name='agentworkflowtemplate',
            name='agent_template_org_scope_needs_org',
        ),

        # 3. Remove old index on (category, share_scope)
        migrations.RemoveIndex(
            model_name='agentworkflowtemplate',
            name='agent_workf_categor_b2b87d_idx',
        ),

        # 4. Remove share_scope field
        migrations.RemoveField(
            model_name='agentworkflowtemplate',
            name='share_scope',
        ),

        # 5. Add new indexes
        migrations.AddIndex(
            model_name='agentworkflowtemplate',
            index=models.Index(fields=['category'], name='agent_tmpl_category_idx'),
        ),
        migrations.AddIndex(
            model_name='agentworkflowtemplate',
            index=models.Index(fields=['project', 'is_deleted'], name='agent_tmpl_project_idx'),
        ),
    ]
