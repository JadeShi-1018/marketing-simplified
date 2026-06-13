from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    replaces = [
        ("task", "0002_add_approval_chain_models"),
        ("task", "0003_approvalchain_required_approvals"),
        ("task", "0004_task_draft_payload"),
        ("task", "0005_alter_approvalrecord_options_and_more"),
        ("task", "0005_task_meeting_action_item_lineage"),
        ("task", "0006_merge_task_0005_heads"),
        ("task", "0006_task_origin_action_item"),
        ("task", "0006_task_planned_start_date"),
        ("task", "0007_merge_task_heads"),
        ("task", "0008_merge_task_lineage_and_planned_start"),
        ("task", "0009_task_linear_issue_id"),
        ("task", "0009_tasklabel_task_labels"),
        ("task", "0010_task_invite_pending"),
        ("task", "0010_task_tags_drop_tasklabel"),
        ("task", "0010_taskfieldhistory"),
        ("task", "0011_merge_0010_task_invite_pending_0010_taskfieldhistory"),
        ("task", "0011_merge_task_heads"),
        ("task", "0011_task_created_by"),
        ("task", "0012_backfill_created_by_from_history"),
        ("task", "0013_taskpin"),
        ("task", "0014_merge_invite_pending_and_taskpin"),
        ("task", "0014_merge_task_labels_and_pins"),
        ("task", "0015_merge_20260526_0244"),
        ("task", "0015_merge_20260527_0357"),
    ]

    dependencies = [
        ("task", "0001_initial"),
        ("meetings", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="origin_action_item",
            field=models.OneToOneField(
                "meetings.MeetingActionItem",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="derived_task",
                null=True,
                blank=True,
                help_text="Immutable lineage: meeting action item this task was converted from.",
            ),
        ),
    ]
