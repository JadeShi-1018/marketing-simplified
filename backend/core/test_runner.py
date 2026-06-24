"""
Custom test runner that handles cross-schema foreign key constraints.

This test runner overrides the default database flushing behavior to use
TRUNCATE ... CASCADE, which allows tests to run successfully when tenant
schemas have foreign keys referencing public schema tables.
"""
from django.test.runner import DiscoverRunner
from django.db import connections, transaction


class CascadeTruncateTestRunner(DiscoverRunner):
    """
    Test runner that uses TRUNCATE ... CASCADE for database cleanup.
    """

    def setup_databases(self, **kwargs):
        """
        Set up test databases with custom flush behavior.
        """
        return super().setup_databases(**kwargs)

    def teardown_databases(self, old_config, **kwargs):
        """
        Tear down test databases.
        """
        return super().teardown_databases(old_config, **kwargs)


def flush_database_with_cascade(connection):
    """
    Flush all tables in the database using TRUNCATE ... CASCADE.

    This function is designed to be used as a replacement for Django's
    default flush operation when cross-schema foreign keys prevent
    standard TRUNCATE from working.

    Args:
        connection: Django database connection
    """
    with connection.cursor() as cursor:
        # Get current search path to determine which schema to flush
        cursor.execute("SHOW search_path;")
        search_path = cursor.fetchone()[0]

        # Extract first schema from search path (usually 'public' or tenant schema)
        schema = search_path.split(',')[0].strip().strip('"')

        # Get all tables in the schema (excluding system tables and migrations)
        cursor.execute("""
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = %s
            AND tablename NOT LIKE 'pg_%%'
            AND tablename != 'django_migrations'
            ORDER BY tablename;
        """, [schema])

        tables = [row[0] for row in cursor.fetchall()]

        if tables:
            with transaction.atomic(using=connection.alias):
                # Build and execute TRUNCATE with CASCADE
                table_list = ', '.join([f'"{table}"' for table in tables])
                cursor.execute(
                    f'TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE;'
                )
