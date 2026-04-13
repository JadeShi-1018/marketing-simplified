import os
from datetime import timedelta

from celery import Celery

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

app = Celery('backend')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
app.autodiscover_tasks()

# ── System notification beat schedule ─────────────────────────────────────────
app.conf.beat_schedule = {
    # Calendar reminders fire every minute so users receive them close to on-time.
    "fire-calendar-reminders": {
        "task": "notifications.tasks.fire_calendar_reminders",
        "schedule": timedelta(minutes=1),
    },
    # Task overdue check — hourly is fine; overdue tasks don't change by the minute.
    "fire-task-overdue-notifications": {
        "task": "notifications.tasks.fire_task_overdue_notifications",
        "schedule": timedelta(hours=1),
    },
    # Decision deadline reminder — runs twice a day.
    "fire-decision-deadline-notifications": {
        "task": "notifications.tasks.fire_decision_deadline_notifications",
        "schedule": timedelta(hours=12),
    },
    # Meeting starting-soon alert — polls every 5 min with a 10-min lookahead.
    "fire-meeting-starting-soon-notifications": {
        "task": "notifications.tasks.fire_meeting_starting_soon_notifications",
        "schedule": timedelta(minutes=5),
    },
}
app.conf.timezone = "UTC"


@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
