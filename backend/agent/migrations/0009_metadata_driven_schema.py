# Placeholder migration - operations already in 0001_initial.py
# This migration exists only to maintain the dependency chain for other apps.

from django.conf import settings
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0008_prepend_column_detection_to_default_workflow'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0001_initial'),
    ]

    operations = [
        # Operations already applied in 0001_initial (compressed migration)
    ]
