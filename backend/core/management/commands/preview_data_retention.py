from django.core.management.base import BaseCommand

from core.tasks import sweep_data_retention


class Command(BaseCommand):
    help = (
        "Preview what the next data-retention sweep (MED-341) would delete. "
        "Always dry-run -- never deletes. Real deletes run only via the "
        "Celery Beat schedule (core.tasks.sweep_data_retention). This command "
        "has no execute/force option -- it is permanently preview-only."
    )

    def handle(self, *args, **options):
        result = sweep_data_retention(dry_run=True)

        for label, r in result["rules"].items():
            if r.get("skipped"):
                self.stdout.write(self.style.WARNING(f"  {label}: SKIPPED ({r['reason']})"))
                continue
            self.stdout.write(f"  {label}: {r['matched']} row(s) matched (cutoff={r['cutoff']})")

        self.stdout.write(self.style.WARNING(
            "Dry run only -- no rows were deleted. Real deletes run via the Celery Beat schedule."
        ))
