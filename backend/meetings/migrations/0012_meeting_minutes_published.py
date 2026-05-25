from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("meetings", "0011_change_layout_config_default_to_dict"),
    ]

    operations = [
        migrations.AddField(
            model_name="meeting",
            name="minutes_published",
            field=models.BooleanField(
                default=False,
                help_text="Whether the meeting minutes have been published to all participants.",
            ),
        ),
    ]
