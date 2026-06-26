from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings
import uuid


def create_immutability_trigger(apps, schema_editor):
    schema_editor.execute("""
    CREATE OR REPLACE FUNCTION raise_audit_immutable_error()
    RETURNS TRIGGER AS $$
    BEGIN
        RAISE EXCEPTION 'Meeting audit log entries are immutable and cannot be modified';
    END;
    $$ LANGUAGE plpgsql;
    """)

    schema_editor.execute("""
    CREATE TRIGGER meeting_audit_log_immutable
    BEFORE UPDATE OR DELETE ON meetings_meetingauditlog
    FOR EACH ROW
    EXECUTE FUNCTION raise_audit_immutable_error();
    """)

def drop_immutability_trigger(apps, schema_editor):
    schema_editor.execute("""
    DROP TRIGGER IF EXISTS meeting_audit_log_immutable ON meetings_meetingauditlog;
    """)
    schema_editor.execute("""
    DROP FUNCTION IF EXISTS raise_audit_immutable_error();
    """)

class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("meetings", "0011_change_layout_config_default_to_dict"),
    ]

    operations = []
