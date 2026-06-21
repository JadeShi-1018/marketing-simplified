# Merge migration: unifies the meeting-slug branch with the
# audit-log changes that landed on prod-preview. No schema operations.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('meetings', '0018_meeting_slug'),
        ('meetings', '0019_alter_meetingauditlog_meeting_and_more'),
    ]

    operations = []
