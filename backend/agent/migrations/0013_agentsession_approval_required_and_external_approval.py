# Placeholder migration - operations already in 0001_initial.py
# This migration exists only to maintain the dependency chain for other apps.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("agent", "0012_remove_importeddatafield_unique_imported_data_field_position_and_more"),
    ]

    operations = [
        # Operations already applied in 0001_initial (compressed migration)
    ]
