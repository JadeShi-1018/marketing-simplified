# Generated manually: merge MED-331 backfill with prod-preview zoom meeting chain.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("zoom_integration", "0002_backfill_encrypt_tokens"),
        ("zoom_integration", "0004_zoom_meeting_data_zoom_host_user"),
    ]

    operations = []
