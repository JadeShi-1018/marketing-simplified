from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

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
