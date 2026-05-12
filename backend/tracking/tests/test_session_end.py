import uuid
from django.contrib.auth import get_user_model
from django.utils import timezone
from freezegun import freeze_time
from rest_framework.test import APITestCase

from tracking.models import TrackingSession

User = get_user_model()

END_URL = '/api/tracking/sessions/{pk}/end/'


def make_session(user, **kwargs):
    return TrackingSession.objects.create(user=user, **kwargs)


class SessionEndViewTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='alice', email='alice@test.com', password='pass')
        self.other = User.objects.create_user(username='bob', email='bob@test.com', password='pass')
        self.client.force_authenticate(user=self.user)

    def url(self, pk):
        return END_URL.format(pk=pk)

    # 1. Normal end: ended_at set, end_reason=CLOSED, active_seconds accumulates final delta
    @freeze_time('2026-01-01 12:00:00')
    def test_normal_end_sets_fields_correctly(self):
        session = make_session(self.user, active_seconds=200)
        frozen_now = timezone.now()

        response = self.client.post(
            self.url(session.pk),
            {'active_delta_seconds': 15, 'end_reason': 'CLOSED'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.ended_at, frozen_now)
        self.assertEqual(session.end_reason, 'CLOSED')
        self.assertEqual(session.active_seconds, 215)

    # 2. Idempotency: second call returns 200 but ended_at is unchanged (the critical test)
    @freeze_time('2026-01-01 12:00:00')
    def test_repeated_end_is_idempotent(self):
        session = make_session(self.user, active_seconds=100)
        first_ended_at = timezone.now()

        self.client.post(self.url(session.pk), {'active_delta_seconds': 10, 'end_reason': 'CLOSED'}, format='json')
        session.refresh_from_db()
        self.assertEqual(session.ended_at, first_ended_at)

        with freeze_time('2026-01-01 13:00:00'):
            response = self.client.post(
                self.url(session.pk),
                {'active_delta_seconds': 99, 'end_reason': 'CLOSED'},
                format='json',
            )

        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        # ended_at must still be the original frozen time, not the second call's time
        self.assertEqual(session.ended_at, first_ended_at)
        # active_seconds must not accumulate the second delta
        self.assertEqual(session.active_seconds, 110)

    # 3. Session does not exist → 404
    def test_nonexistent_session_returns_404(self):
        response = self.client.post(self.url(uuid.uuid4()), {'end_reason': 'CLOSED'}, format='json')
        self.assertEqual(response.status_code, 404)

    # 4. Session belongs to another user → 404
    def test_other_users_session_returns_404(self):
        session = make_session(self.other)
        response = self.client.post(self.url(session.pk), {'end_reason': 'CLOSED'}, format='json')
        self.assertEqual(response.status_code, 404)

    # 5. end_reason=TIMEOUT → 400 (frontend cannot send this)
    def test_timeout_end_reason_returns_400(self):
        session = make_session(self.user)
        response = self.client.post(self.url(session.pk), {'end_reason': 'TIMEOUT'}, format='json')
        self.assertEqual(response.status_code, 400)

    # 6. No active_delta_seconds → succeeds, end_reason set correctly
    def test_end_without_delta_succeeds(self):
        session = make_session(self.user, active_seconds=50)
        response = self.client.post(self.url(session.pk), {'end_reason': 'CLOSED'}, format='json')
        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertIsNotNone(session.ended_at)
        self.assertEqual(session.end_reason, 'CLOSED')
        self.assertEqual(session.active_seconds, 50)
