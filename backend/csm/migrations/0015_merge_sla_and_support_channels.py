# Merge parallel migration branches: SLA policy (prod-preview) and support channels (CSM-S01-02)

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('csm', '0012_merge_20260623_0217'),
        ('csm', '0014_remove_ticket_support_channel'),
    ]

    operations = [
    ]
