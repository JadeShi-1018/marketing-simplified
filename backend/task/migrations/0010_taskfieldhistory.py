from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('task', '0009_task_linear_issue_id'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = []
