from django.conf import settings
from django.db import models
from django.db.models import F, Q


class FocusSession(models.Model):
    """
    A single-user focus session on one Task. Signals are time-window snapshots.
    """

    task = models.ForeignKey(
        "task.Task",
        on_delete=models.CASCADE,
        related_name="focus_sessions",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="focus_sessions",
    )
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    total_focused_ms = models.BigIntegerField(default=0)
    total_keystrokes = models.BigIntegerField(default=0)
    total_backspaces = models.BigIntegerField(default=0)
    total_tab_switches = models.IntegerField(default=0)
    total_rapid_switches = models.IntegerField(default=0)
    total_mouse_hesitations = models.IntegerField(default=0)
    total_inactivity_pauses = models.IntegerField(default=0)
    total_repeated_navigations = models.IntegerField(default=0)
    total_abnormal_interruptions = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["user", "-started_at"]),
            models.Index(fields=["task", "-started_at"]),
        ]

    def __str__(self) -> str:
        return f"FocusSession #{self.pk} task={self.task_id} user={self.user_id}"

    @property
    def is_active(self) -> bool:
        return self.ended_at is None


class BehavioralSignal(models.Model):
    """
    One row per reporting window (e.g. 30s). Counts are deltas for that window only.
    """

    session = models.ForeignKey(
        FocusSession,
        on_delete=models.CASCADE,
        related_name="signals",
    )
    window_started_at = models.DateTimeField()
    window_ended_at = models.DateTimeField()

    focused_ms = models.IntegerField(default=0)
    keystroke_count = models.IntegerField(default=0)
    backspace_count = models.IntegerField(default=0)
    tab_switch_count = models.IntegerField(default=0)
    rapid_switch_count = models.IntegerField(default=0)
    mouse_hesitation_count = models.IntegerField(default=0)
    inactivity_pause_count = models.IntegerField(default=0)
    repeated_navigation_count = models.IntegerField(default=0)
    abnormal_interruption_count = models.IntegerField(default=0)

    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["session_id", "window_started_at"]
        indexes = [
            models.Index(fields=["session", "window_started_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(focused_ms__gte=0),
                name="bt_signal_focused_ms_gte_0",
            ),
            models.CheckConstraint(
                check=Q(keystroke_count__gte=0),
                name="bt_signal_keystroke_gte_0",
            ),
            models.CheckConstraint(
                check=Q(backspace_count__gte=0),
                name="bt_signal_backspace_gte_0",
            ),
            models.CheckConstraint(
                check=Q(tab_switch_count__gte=0),
                name="bt_signal_tabswitch_gte_0",
            ),
            models.CheckConstraint(
                check=Q(rapid_switch_count__gte=0),
                name="bt_signal_rapidswitch_gte_0",
            ),
            models.CheckConstraint(
                check=Q(mouse_hesitation_count__gte=0),
                name="bt_signal_hesitation_gte_0",
            ),
            models.CheckConstraint(
                check=Q(inactivity_pause_count__gte=0),
                name="bt_signal_inactivity_gte_0",
            ),
            models.CheckConstraint(
                check=Q(repeated_navigation_count__gte=0),
                name="bt_signal_repeatnav_gte_0",
            ),
            models.CheckConstraint(
                check=Q(abnormal_interruption_count__gte=0),
                name="bt_signal_abnormal_gte_0",
            ),
            models.CheckConstraint(
                check=Q(window_ended_at__gte=F("window_started_at")),
                name="bt_signal_window_valid",
            ),
        ]

    def __str__(self) -> str:
        return f"BehavioralSignal #{self.pk} session={self.session_id}"
