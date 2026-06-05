from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0021_add_chat_created_by'),
    ]

    operations = [
        migrations.AddField(
            model_name='chatparticipant',
            name='muted_until',
            field=models.DateTimeField(
                blank=True,
                help_text='Optional expiry time for a temporary mute',
                null=True,
            ),
        ),
    ]
