from django.db import migrations


class Migration(migrations.Migration):
    """
    Update the audit log immutability trigger to allow SET NULL cascade on actor_id
    when the referenced user is deleted. All other updates remain blocked.
    """

    dependencies = [
        ('meetings', '0015_allow_null_audit_log_context'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            CREATE OR REPLACE FUNCTION raise_audit_immutable_error()
            RETURNS TRIGGER AS $$
            BEGIN
                -- Allow SET NULL cascade when the referenced user is deleted:
                -- only actor_id changes (non-null → null), everything else stays the same.
                IF (
                    OLD.actor_id IS NOT NULL AND
                    NEW.actor_id IS NULL AND
                    OLD.event_type = NEW.event_type AND
                    OLD.meeting_id = NEW.meeting_id AND
                    OLD.before IS NOT DISTINCT FROM NEW.before AND
                    OLD.after IS NOT DISTINCT FROM NEW.after AND
                    OLD.context IS NOT DISTINCT FROM NEW.context
                ) THEN
                    RETURN NEW;
                END IF;
                RAISE EXCEPTION 'Meeting audit log entries are immutable and cannot be modified';
            END;
            $$ LANGUAGE plpgsql;
            """,
            reverse_sql="""
            CREATE OR REPLACE FUNCTION raise_audit_immutable_error()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'Meeting audit log entries are immutable and cannot be modified';
            END;
            $$ LANGUAGE plpgsql;
            """,
        ),
    ]
