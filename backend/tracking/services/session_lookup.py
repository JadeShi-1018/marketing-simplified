from django.core.cache import cache
from django.utils import timezone

from tracking.models import TrackingSession

SESSION_TTL = 1800  # 30 minutes


class SessionLookup:
    KEY_PREFIX = "tracking:active_session:"

    def _key(self, user_id):
        return f"{self.KEY_PREFIX}{user_id}"

    def get_or_create_session(self, user_id, user_agent=""):
        key = self._key(user_id)
        session_id = cache.get(key)
        now = timezone.now()

        if session_id:
            cache.set(key, session_id, timeout=SESSION_TTL)
            TrackingSession.objects.filter(
                pk=session_id,
                ended_at__isnull=True,
            ).update(last_heartbeat_at=now)
            return session_id

        session = TrackingSession.objects.create(
            user_id=user_id,
            user_agent=user_agent or "",
            last_heartbeat_at=now,
        )
        sid = str(session.pk)
        cache.set(key, sid, timeout=SESSION_TTL)
        return sid
