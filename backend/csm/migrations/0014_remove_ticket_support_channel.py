import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('csm', '0013_ticket_support_channel'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='ticket',
            name='support_channel',
        ),
        migrations.RemoveField(
            model_name='ticketformsubmission',
            name='support_channel',
        ),
    ]
