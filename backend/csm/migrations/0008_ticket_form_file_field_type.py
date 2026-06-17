"""Re-add file attachment custom field type."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('csm', '0007_ticket_form_field_types_v2'),
    ]

    operations = [
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
                    ('file', 'File attachment'),
                ],
                max_length=30,
            ),
        ),
    ]
