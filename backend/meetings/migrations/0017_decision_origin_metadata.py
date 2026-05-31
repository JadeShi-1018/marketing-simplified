# Generated for SMP-488 Decision Capture Integration

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_meeting_decision_origins(apps, schema_editor):
    MeetingDecisionOrigin = apps.get_model("meetings", "MeetingDecisionOrigin")
    user_app_label, user_model_name = settings.AUTH_USER_MODEL.split(".")
    User = apps.get_model(user_app_label, user_model_name)

    fallback_user_id = (
        User.objects.order_by("id")
        .values_list("id", flat=True)
        .first()
    )

    for origin in MeetingDecisionOrigin.objects.select_related("meeting", "decision"):
        update_fields = []

        if origin.origin_timestamp is None:
            origin.origin_timestamp = origin.created_at
            update_fields.append("origin_timestamp")

        if not origin.creation_context:
            origin.creation_context = {
                "source": "migration_backfill",
                "meeting_id": origin.meeting_id,
                "decision_id": origin.decision_id,
            }
            update_fields.append("creation_context")

        if origin.created_by_id is None:
            decision_author_id = getattr(origin.decision, "author_id", None)
            origin.created_by_id = decision_author_id or fallback_user_id
            update_fields.append("created_by")

        if update_fields:
            origin.save(update_fields=update_fields)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("meetings", "0016_fix_audit_trigger_allow_actor_set_null"),
    ]

    operations = [
        migrations.AlterField(
            model_name="meetingdecisionorigin",
            name="meeting",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="decision_origins",
                to="meetings.meeting",
            ),
        ),
        migrations.AddField(
            model_name="meetingdecisionorigin",
            name="origin_timestamp",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="meetingdecisionorigin",
            name="creation_context",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="meetingdecisionorigin",
            name="created_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="meeting_decision_origins",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddIndex(
            model_name="meetingdecisionorigin",
            index=models.Index(
                fields=["meeting", "origin_timestamp"],
                name="mtgs_dcor_mtg_time",
            ),
        ),
        migrations.RunPython(
            backfill_meeting_decision_origins,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="meetingdecisionorigin",
            name="origin_timestamp",
            field=models.DateTimeField(),
        ),
        migrations.AlterField(
            model_name="meetingdecisionorigin",
            name="created_by",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="meeting_decision_origins",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
