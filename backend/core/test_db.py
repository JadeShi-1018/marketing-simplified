"""
Custom database wrapper for tests that handles cross-schema foreign keys.

This module provides a PostgreSQL database wrapper that uses TRUNCATE ... CASCADE
instead of the default TRUNCATE, solving the issue where tenant schemas have
foreign keys to public schema tables (e.g., tenant.access_control_userrole
referencing public.core_customuser).
"""
from django.db.backends.postgresql.base import DatabaseWrapper as PostgreSQLDatabaseWrapper
from django.db.backends.postgresql.base import DatabaseFeatures


class CascadeTruncateDatabaseFeatures(DatabaseFeatures):
    """
    Custom database features that enable CASCADE truncate for tests.
    """
    pass


class CascadeTruncateDatabaseWrapper(PostgreSQLDatabaseWrapper):
    """
    PostgreSQL database wrapper that uses TRUNCATE ... CASCADE in tests.
    """
    features_class = CascadeTruncateDatabaseFeatures

    def _execute_flush(self, using):
        """
        Override the flush operation to use TRUNCATE ... CASCADE.
        This allows truncating tables even when they're referenced by
        foreign keys from other schemas.
        """
        from django.core.management.color import no_style
        from django.db import transaction

        with transaction.atomic(using=using):
            with self.cursor() as cursor:
                # Get all table names in the current schema
                cursor.execute("""
                    SELECT tablename
                    FROM pg_tables
                    WHERE schemaname = 'public'
                    AND tablename NOT LIKE 'pg_%'
                    AND tablename != 'django_migrations'
                    ORDER BY tablename;
                """)

                tables = [row[0] for row in cursor.fetchall()]

                if tables:
                    # Build TRUNCATE statement with CASCADE
                    table_list = ', '.join([f'"{table}"' for table in tables])
                    cursor.execute(
                        f'TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE;'
                    )
