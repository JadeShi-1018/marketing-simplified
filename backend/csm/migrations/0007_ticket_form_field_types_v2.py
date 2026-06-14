"""Phase 7: replace legacy custom field types with 10 new types + field_config."""

from django.db import migrations, models

TYPE_MAP = {
    'text': 'short_text',
    'textarea': 'paragraph',
    'select': 'dropdown',
    'multiselect': 'labels',
    'date': 'date',
}


def migrate_field_types_forward(apps, schema_editor):
    TicketFormField = apps.get_model('csm', 'TicketFormField')
    TicketFormField.objects.filter(field_type='file').delete()
    for old, new in TYPE_MAP.items():
        TicketFormField.objects.filter(field_type=old).update(field_type=new)
    # short_text defaults
    for row in TicketFormField.objects.filter(field_type='short_text'):
        cfg = row.field_config or {}
        if 'max_length' not in cfg:
            cfg['max_length'] = 255
            row.field_config = cfg
            row.save(update_fields=['field_config'])


def migrate_field_types_backward(apps, schema_editor):
    TicketFormField = apps.get_model('csm', 'TicketFormField')
    reverse_map = {v: k for k, v in TYPE_MAP.items()}
    for new, old in reverse_map.items():
        TicketFormField.objects.filter(field_type=new).update(field_type=old)


class Migration(migrations.Migration):

    dependencies = [
        ('csm', '0006_ticket_forms'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticketformfield',
            name='field_config',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.RunPython(migrate_field_types_forward, migrate_field_types_backward),
        migrations.AlterField(
            model_name='ticketformfield',
            name='field_type',
            field=models.CharField(
                choices=[
                    ('system_summary', 'Summary'),
                    ('system_description', 'Description'),
                    ('system_project', 'Project'),
                    ('system_work_type', 'Work Type'),
                    ('short_text', 'Short text'),
                    ('paragraph', 'Paragraph'),
                    ('timestamp', 'Timestamp'),
                    ('dropdown', 'Dropdown'),
                    ('date', 'Date'),
                    ('number', 'Number'),
                    ('labels', 'Labels'),
                    ('checkbox', 'Checkbox'),
                    ('people', 'People'),
                    ('url', 'URL'),
                ],
                max_length=30,
            ),
        ),
    ]
