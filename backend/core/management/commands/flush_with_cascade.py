"""
Custom flush command that uses TRUNCATE ... CASCADE to handle foreign key constraints.

This command is designed for use in tests to work around PostgreSQL's restriction
on truncating tables that are referenced by foreign keys from other schemas
(e.g., tenant schemas referencing public.core_customuser).

Usage:
    python manage.py flush_with_cascade --noinput
"""
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.apps import apps


class Command(BaseCommand):
    help = 'Truncate all tables in the current schema with CASCADE (for tests)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--noinput',
            '--no-input',
            action='store_true',
            help='Do not prompt for confirmation',
        )
        parser.add_argument(
            '--schema',
            type=str,
            default='public',
            help='Schema to flush (default: public)',
        )

    def handle(self, *args, **options):
        schema = options['schema']

        if not options['noinput']:
            confirm = input(
                f'This will DELETE ALL DATA in {schema} schema. '
                'Are you sure? [y/N] '
            )
            if confirm.lower() != 'y':
                self.stdout.write('Flush cancelled.')
                return

        self.stdout.write(f'Flushing {schema} schema with CASCADE...')

        with connection.cursor() as cursor:
            # Set search path
            cursor.execute(f"SET search_path TO {schema};")

            # Get all tables in the schema
            cursor.execute("""
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = %s
                AND tablename NOT LIKE 'pg_%%'
                AND tablename != 'django_migrations'
                ORDER BY tablename;
            """, [schema])

            tables = [row[0] for row in cursor.fetchall()]

            if not tables:
                self.stdout.write(
                    self.style.WARNING(f'No tables found in {schema} schema')
                )
                return

            self.stdout.write(f'Found {len(tables)} tables to truncate')

            # Disable triggers and truncate all tables with CASCADE
            with transaction.atomic():
                # Build TRUNCATE statement for all tables
                table_list = ', '.join([f'"{table}"' for table in tables])

                self.stdout.write(f'Truncating {len(tables)} tables...')
                cursor.execute(
                    f'TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE;'
                )

                self.stdout.write(
                    self.style.SUCCESS(
                        f'✓ Successfully flushed {len(tables)} tables from {schema} schema'
                    )
                )
