from django.db import migrations, models
import django.db.models.deletion


def clear_labels(apps, schema_editor):
    """Drop existing labels before re-scoping from organisation to project.

    Labels move from a CustomerOrganisation scope to a Project scope. Existing
    rows reference an organisation and have no project, so they can't be mapped
    1:1 — clearing them is safe (a customer's status_label is SET_NULL).
    """
    CustomerStatusLabel = apps.get_model('customer', 'CustomerStatusLabel')
    CustomerStatusLabel.objects.all().delete()


class Migration(migrations.Migration):

    # Non-atomic: the row deletion must commit (flushing the FK SET_NULL trigger
    # events on customer.status_label) before the ALTER TABLE statements run on
    # Postgres, otherwise it errors with "pending trigger events".
    atomic = False

    dependencies = [
        ('core', '0009_merge_project_slug_org_admin'),
        ('customer', '0011_merge_20260621_2319'),
    ]

    operations = [
        migrations.RunPython(clear_labels, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name='customerstatuslabel',
            name='customer_status_label_unique_name_per_org',
        ),
        migrations.RemoveField(
            model_name='customerstatuslabel',
            name='organisation',
        ),
        migrations.AddField(
            model_name='customerstatuslabel',
            name='project',
            field=models.ForeignKey(
                default=None,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='customer_status_labels',
                to='core.project',
            ),
            preserve_default=False,
        ),
        migrations.AddConstraint(
            model_name='customerstatuslabel',
            constraint=models.UniqueConstraint(
                fields=('project', 'name'),
                name='customer_status_label_unique_name_per_project',
            ),
        ),
    ]
