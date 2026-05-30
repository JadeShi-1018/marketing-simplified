# Fix column name mismatch between database (event_code) and model (event_type)
# The migrations 0001 and 0002 were marked as applied but the actual database
# has different column names from a legacy schema.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_expand_notification_choices"),
    ]

    operations = [
        # Rename event_code to event_type using raw SQL
        # This handles the case where Django thinks the field is already event_type
        # but the database still has event_code
        migrations.RunSQL(
            sql="""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'notifications_notification'
                        AND column_name = 'event_code'
                    ) THEN
                        ALTER TABLE notifications_notification
                        RENAME COLUMN event_code TO event_type;
                    END IF;
                END $$;
            """,
            reverse_sql="""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'notifications_notification'
                        AND column_name = 'event_type'
                    ) THEN
                        ALTER TABLE notifications_notification
                        RENAME COLUMN event_type TO event_code;
                    END IF;
                END $$;
            """,
        ),
        # Drop legacy columns that are not in the current model
        migrations.RunSQL(
            sql="""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'notifications_notification'
                        AND column_name = 'is_mention'
                    ) THEN
                        ALTER TABLE notifications_notification DROP COLUMN is_mention;
                    END IF;
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'notifications_notification'
                        AND column_name = 'is_deadline'
                    ) THEN
                        ALTER TABLE notifications_notification DROP COLUMN is_deadline;
                    END IF;
                END $$;
            """,
            reverse_sql="SELECT 1;",  # No reverse for dropping columns
        ),
    ]
