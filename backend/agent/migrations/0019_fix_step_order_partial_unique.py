from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0018_add_flow_control_step_types'),
    ]

    operations = [
        # Remove the old full unique_together constraint that included soft-deleted rows,
        # which caused IntegrityError when reordering after soft-deletions.
        migrations.AlterUniqueTogether(
            name='agentworkflowstep',
            unique_together=set(),
        ),
        # Replace with a partial unique index scoped to active (non-deleted) steps only.
        migrations.AddConstraint(
            model_name='agentworkflowstep',
            constraint=models.UniqueConstraint(
                fields=['workflow', 'order'],
                condition=Q(is_deleted=False),
                name='unique_active_workflow_step_order',
            ),
        ),
    ]
