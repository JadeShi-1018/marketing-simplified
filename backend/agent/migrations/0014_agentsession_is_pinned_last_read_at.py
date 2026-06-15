# Placeholder migration - operations already in 0001_initial.py
# This migration exists only to maintain the dependency chain for other apps.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0013_agentsession_approval_required_and_external_approval'),
    ]

    operations = [
        # Operations already applied in 0001_initial (compressed migration)
    ]
