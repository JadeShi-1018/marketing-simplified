# Generated manually for user-starred chats (Slack-style sidebar)

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('chat', '0003_message_soft_delete_fields'),
    ]

    operations = []
