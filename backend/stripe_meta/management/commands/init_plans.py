from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'DEPRECATED — plan seeding is handled by migration 0004_seed_token_plans'

    def handle(self, *args, **options):
        self.stdout.write(
            self.style.WARNING(
                'init_plans is deprecated. Run `python manage.py migrate` instead.'
            )
        )
