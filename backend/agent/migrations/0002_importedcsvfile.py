# Placeholder migration - operations already in 0001_initial.py
# This migration exists only to maintain the dependency chain for other apps.

from django.conf import settings
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0001_initial'),
        ('core', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Operations already applied in 0001_initial (compressed migration)
    ]
