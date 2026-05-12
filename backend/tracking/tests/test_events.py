import uuid
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework.test import APITestCase

from task.models import Task
from core.models import Project
from tracking.models import TrackingEvent, TrackingSession

User = get_user_model()

EVENTS_URL = '/api/tracking/events/'


def make_session(user, **kwargs):
    return TrackingSession.objects.create(user=user, **kwargs)


def make_event_payload(session, n=1, base_event_type='TASK_OPEN', object_id=999):
    return {
        'session_id': str(session.pk),
        'events': [
            {
                'client_event_id': str(uuid.uuid4()),
                'event_type': base_event_type,
                'occurred_at': '2026-01-01T12:00:00Z',
                'content_type': 'task',
                'object_id': object_id,
                'project_id': 1,
                'metadata': {},
            }
            for _ in range(n)
        ],
    }


class EventBulkCreateViewTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='alice', email='alice@test.com', password='pass')
        self.other = User.objects.create_user(username='bob', email='bob@test.com', password='pass')
        self.client.force_authenticate(user=self.user)
        self.session = make_session(self.user)

    # 1. Batch insert 3 events → accepted=3, DB has 3 rows
    def test_bulk_insert_three_events(self):
        payload = make_event_payload(self.session, n=3)
        response = self.client.post(EVENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['accepted'], 3)
        self.assertEqual(TrackingEvent.objects.filter(session=self.session).count(), 3)

    # 2. Repeat same batch (same client_event_id) → accepted=3, DB count unchanged (idempotent!)
    def test_duplicate_events_are_idempotent(self):
        payload = make_event_payload(self.session, n=3)
        self.client.post(EVENTS_URL, payload, format='json')
        response = self.client.post(EVENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['accepted'], 3)
        # DB must still have exactly 3 rows, not 6
        self.assertEqual(TrackingEvent.objects.filter(session=self.session).count(), 3)

    # 3. Session does not exist → 400
    def test_nonexistent_session_returns_400(self):
        payload = make_event_payload(self.session, n=1)
        payload['session_id'] = str(uuid.uuid4())
        response = self.client.post(EVENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 400)

    # 4. Session belongs to another user → 400
    def test_other_users_session_returns_400(self):
        other_session = make_session(self.other)
        payload = make_event_payload(other_session, n=1)
        response = self.client.post(EVENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 400)

    # 5. Session already ended → 400
    def test_ended_session_returns_400(self):
        ended_session = make_session(self.user, ended_at=timezone.now())
        payload = make_event_payload(ended_session, n=1)
        response = self.client.post(EVENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 400)

    # 6. events array > 100 → 400
    def test_over_100_events_returns_400(self):
        payload = make_event_payload(self.session, n=101)
        response = self.client.post(EVENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 400)

    # 7. Invalid event_type → 400
    def test_invalid_event_type_returns_400(self):
        payload = make_event_payload(self.session, n=1)
        payload['events'][0]['event_type'] = 'SESSION_END'
        response = self.client.post(EVENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 400)

    # 8. Empty events array → 200, accepted=0
    def test_empty_events_returns_200_with_zero_accepted(self):
        payload = {'session_id': str(self.session.pk), 'events': []}
        response = self.client.post(EVENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['accepted'], 0)

    # 9. Nonexistent object_id → still saves (orphan allowed per 21c decision)
    def test_orphan_object_id_is_accepted(self):
        payload = make_event_payload(self.session, n=1, object_id=999999)
        response = self.client.post(EVENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['accepted'], 1)
        event = TrackingEvent.objects.filter(session=self.session).first()
        self.assertIsNotNone(event)
        self.assertEqual(event.object_id, 999999)
        # target returns None for nonexistent object — that's expected
        self.assertIsNone(event.target)
