# Fix column name mismatch between database (event_code) and model (event_type)
# The migrations 0001 and 0002 were marked as applied but the actual database
# has different column names from a legacy schema.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_expand_notification_choices"),
    ]

    operations = []
