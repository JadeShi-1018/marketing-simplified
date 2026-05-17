from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("meetings", "0012_meeting_minutes_published"),
    ]

    operations = [
        migrations.AddField(
            model_name="participantlink",
            name="is_accepted",
            field=models.BooleanField(
                default=False,
                help_text="True once the invitee explicitly accepts; False while the invite is pending.",
            ),
        ),
    ]
