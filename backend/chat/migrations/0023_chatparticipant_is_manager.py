from django.db import migrations, models


def seed_channel_managers(apps, schema_editor):
    Chat = apps.get_model('chat', 'Chat')
    ChatParticipant = apps.get_model('chat', 'ChatParticipant')

    for chat in Chat.objects.filter(type='group').iterator():
        participant = None
        if chat.created_by_id:
            participant = ChatParticipant.objects.filter(
                chat_id=chat.id,
                user_id=chat.created_by_id,
            ).first()
        if participant is None:
            participant = ChatParticipant.objects.filter(
                chat_id=chat.id,
                is_active=True,
            ).order_by('joined_at', 'id').first()
        if participant is not None:
            participant.is_manager = True
            participant.save(update_fields=['is_manager'])


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0022_chatparticipant_muted_until'),
    ]

    operations = [
        migrations.AddField(
            model_name='chatparticipant',
            name='is_manager',
            field=models.BooleanField(
                default=False,
                help_text='Whether this participant can manage channel members and settings',
            ),
        ),
        migrations.RunPython(seed_channel_managers, migrations.RunPython.noop),
    ]
