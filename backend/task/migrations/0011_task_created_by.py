from django.conf import settings
from django.db import migrations, models
from django.db.models import F
import django.db.models.deletion


def backfill_created_by_from_owner(apps, schema_editor):
    Task = apps.get_model("task", "Task")
    Task.objects.filter(
        created_by__isnull=True,
        owner__isnull=False,
    ).update(created_by_id=F("owner_id"))


class Migration(migrations.Migration):

    dependencies = [
        ("task", "0010_taskfieldhistory"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = []
