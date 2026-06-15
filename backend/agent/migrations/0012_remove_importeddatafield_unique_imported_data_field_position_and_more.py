# Placeholder migration - operations already in 0001_initial.py
# This migration exists only to maintain the dependency chain for other apps.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
        ('agent', '0011_insert_generate_criteria_step'),
    ]

    operations = [
        # Operations already applied in 0001_initial (compressed migration)
    ]
