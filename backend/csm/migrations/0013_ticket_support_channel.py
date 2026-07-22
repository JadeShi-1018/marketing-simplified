# CSM-S01-02 customer channel runtime — attribute portal form tickets to a channel

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('csm', '0011_support_channels'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='support_channel',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='tickets',
                to='csm.supportchannel',
            ),
        ),
        migrations.AddField(
            model_name='ticketformsubmission',
            name='support_channel',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='ticket_form_submissions',
                to='csm.supportchannel',
            ),
        ),
    ]
