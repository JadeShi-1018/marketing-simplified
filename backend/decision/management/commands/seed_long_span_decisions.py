"""
Seed decisions across a long date range for testing Decision Tree layout.

Usage:
  python manage.py seed_long_span_decisions --project-id=1
  python manage.py seed_long_span_decisions --project-id=1 --clear
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from core.models import Project
from decision.models import Decision

User = get_user_model()

PREFIX = '[Long-span demo] '


class Command(BaseCommand):
    help = 'Create sample decisions spread across months for Decision Tree layout testing.'

    def add_arguments(self, parser):
        parser.add_argument('--project-id', type=int, required=True)
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Remove previously seeded demo decisions for this project.',
        )

    def handle(self, *args, **options):
        project_id = options['project_id']
        project = Project.objects.filter(pk=project_id).first()
        if not project:
            self.stderr.write(self.style.ERROR(f'Project {project_id} not found.'))
            return

        if options['clear']:
            deleted, _ = Decision.objects.filter(
                project=project,
                title__startswith=PREFIX,
                is_deleted=False,
            ).delete()
            self.stdout.write(self.style.SUCCESS(f'Removed {deleted} demo decision(s).'))
            return

        author = project.owner or User.objects.filter(is_superuser=True).first()
        if not author:
            self.stderr.write(self.style.ERROR('No author user available.'))
            return

        max_seq = (
            Decision.objects.filter(project=project, is_deleted=False).aggregate(
                max_seq=Max('project_seq')
            )['max_seq']
            or 0
        )

        now = timezone.now()
        # Spread ~18 cards from 8 months ago through today
        offsets_days = [
            -240, -210, -180, -150, -120, -95, -70, -55, -40, -28, -21, -14, -10, -7, -5, -3, -2, 0,
        ]
        titles = [
            'Kickoff: scope the Q1 experiment',
            'Baseline metrics review',
            'Channel mix hypothesis',
            'Creative brief v1',
            'Budget guardrails',
            'Mid-quarter checkpoint',
            'Audience segment test',
            'Landing page variant A',
            'Landing page variant B',
            'Spend pacing review',
            'Creative refresh',
            'Offer test — 10% off',
            'Offer test — free shipping',
            'Retargeting window change',
            'Bid strategy adjustment',
            'Weekly performance retro',
            'Stakeholder readout prep',
            'Today: ship winning variant',
        ]

        created = 0
        with transaction.atomic():
            for idx, (offset, title) in enumerate(zip(offsets_days, titles)):
                created_at = now + timedelta(days=offset)
                max_seq += 1
                decision = Decision.objects.create(
                    title=f'{PREFIX}{title}',
                    status=Decision.Status.COMMITTED,
                    author=author,
                    project=project,
                    project_seq=max_seq,
                    context_summary='Demo decision for long-span Decision Tree layout.',
                    reasoning='Seeded by seed_long_span_decisions management command.',
                    risk_level=Decision.RiskLevel.LOW,
                    confidence=0.7,
                    committed_at=created_at,
                    committed_by=author,
                )
                Decision.objects.filter(pk=decision.pk).update(
                    created_at=created_at,
                    updated_at=created_at,
                )
                created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Created {created} demo decisions on project {project_id} '
                f'({offsets_days[0]}d … {offsets_days[-1]}d from today). '
                f'Remove with --clear.'
            )
        )
