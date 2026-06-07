from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('meetings', '0017_decision_origin_metadata'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            DROP TRIGGER IF EXISTS meeting_audit_log_immutable ON meetings_meetingauditlog;
            CREATE TRIGGER meeting_audit_log_immutable
            BEFORE UPDATE ON meetings_meetingauditlog
            FOR EACH ROW
            EXECUTE FUNCTION raise_audit_immutable_error();
            """,
            reverse_sql="""
            DROP TRIGGER IF EXISTS meeting_audit_log_immutable ON meetings_meetingauditlog;
            CREATE TRIGGER meeting_audit_log_immutable
            BEFORE UPDATE OR DELETE ON meetings_meetingauditlog
            FOR EACH ROW
            EXECUTE FUNCTION raise_audit_immutable_error();
            """,
        ),
    ]
