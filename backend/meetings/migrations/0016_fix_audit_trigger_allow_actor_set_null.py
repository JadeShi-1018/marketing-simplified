from django.db import migrations


class Migration(migrations.Migration):
    """
    Update the audit log immutability trigger to allow SET NULL cascade on actor_id
    when the referenced user is deleted. All other updates remain blocked.
    """

    dependencies = [
        ('meetings', '0015_allow_null_audit_log_context'),
    ]

    operations = []
