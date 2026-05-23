from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings
import uuid


def create_immutability_trigger(apps, schema_editor):
    schema_editor.execute("""
    CREATE OR REPLACE FUNCTION raise_audit_immutable_error()
    RETURNS TRIGGER AS $$
    BEGIN
        RAISE EXCEPTION 'Meeting audit log entries are immutable and cannot be modified';
    END;
    $$ LANGUAGE plpgsql;
    """)

    schema_editor.execute("""
    CREATE TRIGGER meeting_audit_log_immutable
    BEFORE UPDATE OR DELETE ON meetings_meetingauditlog
    FOR EACH ROW
    EXECUTE FUNCTION raise_audit_immutable_error();
    """)

def drop_immutability_trigger(apps, schema_editor):
    schema_editor.execute("""
    DROP TRIGGER IF EXISTS meeting_audit_log_immutable ON meetings_meetingauditlog;
    """)
    schema_editor.execute("""
    DROP FUNCTION IF EXISTS raise_audit_immutable_error();
    """)

class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("meetings", "0011_change_layout_config_default_to_dict"),
    ]

    operations = [
        migrations.CreateModel(
            name="MeetingAuditLog",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("meeting.status_changed", "Status Changed"),
                            ("meeting.title_changed", "Title Changed"),
                            ("meeting.objective_changed", "Objective Changed"),
                            ("meeting.summary_changed", "Summary Changed"),
                            ("meeting.type_changed", "Type Changed"),
                            ("meeting.datetime_changed", "Date/Time Changed"),
                            ("meeting.participant_added", "Participant Added"),
                            ("meeting.participant_removed", "Participant Removed"),
                            ("meeting.agenda_item_added", "Agenda Item Added"),
                            ("meeting.agenda_item_edited", "Agenda Item Edited"),
                            ("meeting.agenda_item_deleted", "Agenda Item Deleted"),
                            ("meeting.document_edited", "Document Edited"),
                            ("meeting.action_item_added", "Action Item Added"),
                            ("meeting.action_item_edited", "Action Item Edited"),
                            ("meeting.action_item_resolved", "Action Item Resolved"),
                            ("meeting.decision_created", "Decision Created"),
                            ("meeting.task_created", "Task Created"),
                            ("meeting.template_applied", "Template Applied"),
                            ("meeting.tags_changed", "Tags Changed"),
                        ],
                        db_index=True,
                        max_length=64,
                    ),
                ),
                ("timestamp", models.DateTimeField(auto_now_add=True)),
                ("before", models.JSONField(blank=True, null=True)),
                ("after", models.JSONField(blank=True, null=True)),
                ("context", models.JSONField(default=dict)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="meeting_audit_entries",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "meeting",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="audit_log",
                        to="meetings.meeting",
                    ),
                ),
            ],
            options={
                "ordering": ["-timestamp"],
                "indexes": [
                    models.Index(
                        fields=["meeting", "-timestamp"], name="audit_mtg_ts_idx"
                    ),
                    models.Index(
                        fields=["meeting", "event_type", "-timestamp"],
                        name="audit_mtg_type_ts_idx",
                    ),
                    models.Index(
                        fields=["meeting", "actor", "-timestamp"],
                        name="audit_mtg_actor_ts_idx",
                    ),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name="meetingauditlog",
            constraint=models.CheckConstraint(
                check=models.Q(("id__isnull", False)), name="audit_log_has_id"
            ),
        ),
        migrations.RunPython(
            create_immutability_trigger,
            drop_immutability_trigger,
        ),
    ]
