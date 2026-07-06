# Generated manually: merge MED-331 backfill with prod-preview linear task link chain.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("linear_integration", "0002_backfill_encrypt_tokens"),
        ("linear_integration", "0007_linear_task_link"),
    ]

    operations = []
