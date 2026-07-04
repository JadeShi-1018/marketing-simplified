from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("task", "0012_backfill_created_by_from_history"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = []
