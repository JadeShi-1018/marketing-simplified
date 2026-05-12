import uuid
from django.contrib.auth import get_user_model
from django.utils import timezone
from freezegun import freeze_time
from rest_framework.test import APITestCase

from tracking.models import TrackingSession

User = get_user_model()

HEARTBEAT_URL = '/api/tracking/sessions/{pk}/heartbeat/'


def make_session(user, **kwargs):
    return TrackingSession.objects.create(user=user, **kwargs)


class HeartbeatViewTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='alice', email='alice@test.com', password='pass')
        self.other = User.objects.create_user(username='bob', email='bob@test.com', password='pass')
        self.client.force_authenticate(user=self.user)

    def url(self, pk):
        return HEARTBEAT_URL.format(pk=pk)

    # 1. Normal heartbeat: active_seconds accumulates, last_heartbeat_at updates
    @freeze_time('2026-01-01 12:00:00')
    def test_heartbeat_accumulates_active_seconds_and_updates_timestamp(self):
        session = make_session(self.user, active_seconds=100)
        frozen_now = timezone.now()

        response = self.client.post(self.url(session.pk), {'active_delta_seconds': 30}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'ok': True})
        session.refresh_from_db()
        self.assertEqual(session.active_seconds, 130)
        self.assertEqual(session.last_heartbeat_at, frozen_now)

    # 2. Session does not exist → 404
    def test_nonexistent_session_returns_404(self):
        response = self.client.post(self.url(uuid.uuid4()), {'active_delta_seconds': 10}, format='json')
        self.assertEqual(response.status_code, 404)

    # 3. Session belongs to another user → 404 (not 403, don't expose existence)
    def test_other_users_session_returns_404(self):
        session = make_session(self.other)
        response = self.client.post(self.url(session.pk), {'active_delta_seconds': 10}, format='json')
        self.assertEqual(response.status_code, 404)

    # 4. Session already ended → 404
    def test_ended_session_returns_404(self):
        session = make_session(self.user, ended_at=timezone.now())
        response = self.client.post(self.url(session.pk), {'active_delta_seconds': 10}, format='json')
        self.assertEqual(response.status_code, 404)

    # 5. Negative delta → 400
    def test_negative_delta_returns_400(self):
        session = make_session(self.user)
        response = self.client.post(self.url(session.pk), {'active_delta_seconds': -1}, format='json')
        self.assertEqual(response.status_code, 400)

    # 6. Delta exceeds 600 → 400
    def test_delta_over_600_returns_400(self):
        session = make_session(self.user)
        response = self.client.post(self.url(session.pk), {'active_delta_seconds': 601}, format='json')
        self.assertEqual(response.status_code, 400)

    # 7. Delta = 0 → 200, active_seconds unchanged
    def test_zero_delta_returns_200_and_does_not_change_active_seconds(self):
        session = make_session(self.user, active_seconds=50)
        response = self.client.post(self.url(session.pk), {'active_delta_seconds': 0}, format='json')
        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.active_seconds, 50)
