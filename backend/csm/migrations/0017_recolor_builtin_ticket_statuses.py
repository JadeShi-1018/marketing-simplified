from django.db import migrations

# Align built-in ticket status colors with the conversation status palette
# (active=green, pending=yellow, resolved=blue, closed=gray). Keyed by slug:
# (old default color, new default color). Only rows still on the old default
# are touched, so any admin-customized color is left alone.
RECOLOR = {
    'in_progress': ('#3b82f6', '#22c55e'),
    'pending_customer': ('#f59e0b', '#eab308'),
    'resolved': ('#22c55e', '#3b82f6'),
    'closed': ('#64748b', '#6b7280'),
}


def recolor(apps, schema_editor):
    TicketStatus = apps.get_model('csm', 'TicketStatus')
    for slug, (old, new) in RECOLOR.items():
        TicketStatus.objects.filter(is_builtin=True, slug=slug, color=old).update(color=new)


def undo(apps, schema_editor):
    TicketStatus = apps.get_model('csm', 'TicketStatus')
    for slug, (old, new) in RECOLOR.items():
        TicketStatus.objects.filter(is_builtin=True, slug=slug, color=new).update(color=old)


class Migration(migrations.Migration):

    dependencies = [
        ('csm', '0016_ticket_pending_since_alter_ticket_status_and_more'),
    ]

    operations = [
        migrations.RunPython(recolor, undo),
    ]
