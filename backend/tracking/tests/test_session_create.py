from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from tracking.models import TrackingSession

User = get_user_model()

SESSIONS_URL = '/api/tracking/sessions/'


class SessionCreateViewTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='alice', email='alice@test.com', password='pass')
        self.client.force_authenticate(user=self.user)

    # 1. Creates a session, returns session_id as UUID string
    def test_creates_session_and_returns_uuid(self):
        response = self.client.post(SESSIONS_URL, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertIn('session_id', response.data)
        session_id = response.data['session_id']
        # Must be a valid UUID
        from uuid import UUID
        UUID(session_id)

    # 2. Session is stored in DB and belongs to requesting user
    def test_session_persisted_with_correct_user(self):
        response = self.client.post(SESSIONS_URL, format='json')
        session = TrackingSession.objects.get(pk=response.data['session_id'])
        self.assertEqual(session.user, self.user)
        self.assertIsNone(session.ended_at)
        self.assertEqual(session.active_seconds, 0)

    # 3. Unauthenticated → 401
    def test_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(SESSIONS_URL, format='json')
        self.assertEqual(response.status_code, 401)

    # 4. Each call creates a distinct session (no dedup at this layer)
    def test_multiple_calls_create_distinct_sessions(self):
        r1 = self.client.post(SESSIONS_URL, format='json')
        r2 = self.client.post(SESSIONS_URL, format='json')
        self.assertNotEqual(r1.data['session_id'], r2.data['session_id'])
        self.assertEqual(TrackingSession.objects.filter(user=self.user).count(), 2)
