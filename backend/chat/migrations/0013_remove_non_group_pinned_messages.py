from django.db import migrations


def delete_non_group_pins(apps, schema_editor):
    """Drop pins that live on direct messages.

    Pinning is a group-channel feature guarded by the channel-manager check, but
    an earlier permission branch let any participant of a private chat pin. Those
    rows are now unreachable: the list endpoint hides them and unpin returns 403,
    so nobody can clear them from the UI.
    """
    PinnedMessage = apps.get_model('chat', 'PinnedMessage')
    PinnedMessage.objects.exclude(chat__type='group').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0012_message_client_message_id'),
    ]

    operations = [
        migrations.RunPython(delete_non_group_pins, migrations.RunPython.noop),
    ]
