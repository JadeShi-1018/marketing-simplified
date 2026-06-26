# Knowledge preservation: structured meeting metadata, provenance links, and discovery indexes.

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


def forwards_backfill_meeting_types(apps, schema_editor):
    from django.utils.text import slugify

    Meeting = apps.get_model("meetings", "Meeting")
    MeetingTypeDefinition = apps.get_model("meetings", "MeetingTypeDefinition")

    for m in Meeting.objects.all().iterator():
        raw = (m.meeting_type or "general").strip() or "general"
        safe_label = raw[:160]
        base_slug = (slugify(raw)[:80] or "general")[:80]
        base_slug = base_slug[:80]
        chosen = None
        for i in range(1000):
            slug = base_slug if i == 0 else (base_slug[: 80 - len(f"-{i}")] + f"-{i}")[:80]
            mtd, created = MeetingTypeDefinition.objects.get_or_create(
                project_id=m.project_id,
                slug=slug,
                defaults={"label": safe_label},
            )
            if created or mtd.label == safe_label:
                chosen = mtd
                break
        if chosen is None:
            raise RuntimeError("Meeting type slug allocation failed")
        m.type_definition_id = chosen.id
        m.save(update_fields=["type_definition_id"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("meetings", "0001_initial"),
        ("decision", "0004_merge_predraft_migrations"),
        ("task", "0005_alter_approvalrecord_options_and_more"),
    ]

    operations = []
