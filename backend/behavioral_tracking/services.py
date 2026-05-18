"""
Business logic for focus / behavioral tracking.

Thresholds are documented for alignment with the frontend; ingestion trusts
validated client counts (see ticket scope).
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.db.models import BigIntegerField, IntegerField, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import BehavioralSignal, FocusSession

RAPID_NAV_WINDOW_MS = 3000
RAPID_NAV_THRESHOLD = 3
INACTIVITY_THRESHOLD_MS = 30_000
HESITATION_THRESHOLD_MS = 800
REPORT_WINDOW_MS = 30_000
MAX_SIGNALS_PER_BATCH = 100


class BehavioralTrackingService:
    @staticmethod
    def start_session(*, user, task) -> FocusSession:
        return FocusSession.objects.create(user=user, task=task)

    @staticmethod
    def ingest_signals(*, session: FocusSession, items: list[dict[str, Any]]) -> list[BehavioralSignal]:
        if session.ended_at is not None:
            raise ValueError("Cannot ingest signals on an ended session.")

        objs = [
            BehavioralSignal(
                session=session,
                window_started_at=item["window_started_at"],
                window_ended_at=item["window_ended_at"],
                focused_ms=item.get("focused_ms", 0),
                keystroke_count=item.get("keystroke_count", 0),
                backspace_count=item.get("backspace_count", 0),
                tab_switch_count=item.get("tab_switch_count", 0),
                rapid_switch_count=item.get("rapid_switch_count", 0),
                mouse_hesitation_count=item.get("mouse_hesitation_count", 0),
                inactivity_pause_count=item.get("inactivity_pause_count", 0),
                repeated_navigation_count=item.get("repeated_navigation_count", 0),
                abnormal_interruption_count=item.get("abnormal_interruption_count", 0),
            )
            for item in items
        ]
        with transaction.atomic():
            BehavioralSignal.objects.bulk_create(objs)
        return objs

    @staticmethod
    def end_session(session: FocusSession) -> FocusSession:
        with transaction.atomic():
            locked = FocusSession.objects.select_for_update().get(pk=session.pk)
            if locked.ended_at is not None:
                return locked

            totals = locked.signals.aggregate(
                total_focused_ms=Coalesce(
                    Sum("focused_ms"), Value(0), output_field=BigIntegerField()
                ),
                total_keystrokes=Coalesce(
                    Sum("keystroke_count"), Value(0), output_field=BigIntegerField()
                ),
                total_backspaces=Coalesce(
                    Sum("backspace_count"), Value(0), output_field=BigIntegerField()
                ),
                total_tab_switches=Coalesce(
                    Sum("tab_switch_count"), Value(0), output_field=IntegerField()
                ),
                total_rapid_switches=Coalesce(
                    Sum("rapid_switch_count"), Value(0), output_field=IntegerField()
                ),
                total_mouse_hesitations=Coalesce(
                    Sum("mouse_hesitation_count"), Value(0), output_field=IntegerField()
                ),
                total_inactivity_pauses=Coalesce(
                    Sum("inactivity_pause_count"), Value(0), output_field=IntegerField()
                ),
                total_repeated_navigations=Coalesce(
                    Sum("repeated_navigation_count"), Value(0), output_field=IntegerField()
                ),
                total_abnormal_interruptions=Coalesce(
                    Sum("abnormal_interruption_count"), Value(0), output_field=IntegerField()
                ),
            )

            locked.total_focused_ms = totals["total_focused_ms"]
            locked.total_keystrokes = totals["total_keystrokes"]
            locked.total_backspaces = totals["total_backspaces"]
            locked.total_tab_switches = totals["total_tab_switches"]
            locked.total_rapid_switches = totals["total_rapid_switches"]
            locked.total_mouse_hesitations = totals["total_mouse_hesitations"]
            locked.total_inactivity_pauses = totals["total_inactivity_pauses"]
            locked.total_repeated_navigations = totals["total_repeated_navigations"]
            locked.total_abnormal_interruptions = totals["total_abnormal_interruptions"]
            locked.ended_at = timezone.now()
            locked.save(
                update_fields=[
                    "total_focused_ms",
                    "total_keystrokes",
                    "total_backspaces",
                    "total_tab_switches",
                    "total_rapid_switches",
                    "total_mouse_hesitations",
                    "total_inactivity_pauses",
                    "total_repeated_navigations",
                    "total_abnormal_interruptions",
                    "ended_at",
                    "updated_at",
                ]
            )
            return locked
