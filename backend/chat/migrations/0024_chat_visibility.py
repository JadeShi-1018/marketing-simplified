from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0023_chatparticipant_is_manager'),
    ]

    operations = [
        migrations.AddField(
            model_name='chat',
            name='visibility',
            field=models.CharField(
                choices=[
                    ('public', 'Public: project members can find and join'),
                    ('member_invite', 'Invite-only: any channel member can add people'),
                    ('manager_invite', 'Restricted: only managers can add people'),
                ],
                default='public',
                help_text='Who can discover or add members to this channel',
                max_length=32,
            ),
        ),
    ]
