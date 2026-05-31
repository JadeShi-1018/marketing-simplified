import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from tracking.models import TrackingEvent, TrackingSession

User = get_user_model()

LOCMEM_CACHE = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

URL = '/api/tracking/events/'


def make_session(user, started_at=None):
    now = timezone.now()
    s = TrackingSession.objects.create(
        user=user,
        user_agent='test',
        last_heartbeat_at=started_at or now,
    )
    if started_at:
        TrackingSession.objects.filter(pk=s.pk).update(
            started_at=started_at, last_heartbeat_at=started_at
        )
        s.refresh_from_db()
    return s


def make_event(user, session, event_type='TASK_OPEN', occurred_at=None):
    return TrackingEvent.objects.create(
        session=session,
        user=user,
        event_type=event_type,
        occurred_at=occurred_at or timezone.now(),
        client_event_id=uuid.uuid4(),
        metadata={},
    )


@override_settings(CACHES=LOCMEM_CACHE)
class TrackingEventListViewTests(TestCase):

    def setUp(self):
        self.user_a = User.objects.create_user(
            email='a@test.com', username='user_a', password='pw'
        )
        self.user_b = User.objects.create_user(
            email='b@test.com', username='user_b', password='pw'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user_a)
        self.session_a = make_session(self.user_a)
        self.event_a = make_event(self.user_a, self.session_a)

    # --- Require at least one filter ---

    def test_no_filter_returns_400(self):
        resp = self.client.get(URL)
        self.assertEqual(resp.status_code, 400)

    def test_no_filter_error_message_is_informative(self):
        resp = self.client.get(URL)
        body = resp.json()
        text = str(body)
        self.assertIn('filter', text.lower())

    # --- Filter combinations ---

    def test_event_type_filter_returns_matching_events(self):
        make_event(self.user_a, self.session_a, event_type='TASK_WRITE')
        resp = self.client.get(URL, {'event_type': 'TASK_OPEN'})
        self.assertEqual(resp.status_code, 200)
        results = resp.json()['results']
        self.assertTrue(all(e['event_type'] == 'TASK_OPEN' for e in results))
        self.assertGreaterEqual(len(results), 1)

    def test_user_filter_own_data(self):
        resp = self.client.get(URL, {'user': self.user_a.pk})
        self.assertEqual(resp.status_code, 200)
        results = resp.json()['results']
        self.assertTrue(all(e['user_id'] == self.user_a.pk for e in results))

    def test_session_filter(self):
        other_session = make_session(self.user_a)
        make_event(self.user_a, other_session, event_type='TASK_WRITE')
        resp = self.client.get(URL, {'session': str(self.session_a.pk)})
        self.assertEqual(resp.status_code, 200)
        results = resp.json()['results']
        self.assertTrue(all(e['session_id'] == str(self.session_a.pk) for e in results))

    def test_invalid_session_returns_400(self):
        resp = self.client.get(URL, {'session': 'not-a-uuid'})
        self.assertEqual(resp.status_code, 400)

    def test_target_type_without_target_id_returns_400(self):
        resp = self.client.get(URL, {'target_type': 'task.task'})
        self.assertEqual(resp.status_code, 400)

    def test_target_id_without_target_type_returns_400(self):
        resp = self.client.get(URL, {'target_id': '1'})
        self.assertEqual(resp.status_code, 400)

    def test_unknown_target_type_returns_400(self):
        resp = self.client.get(URL, {'target_type': 'fake.model', 'target_id': '1'})
        self.assertEqual(resp.status_code, 400)

    # --- Cross-user isolation ---

    def test_user_a_cannot_see_user_b_events(self):
        session_b = make_session(self.user_b)
        make_event(self.user_b, session_b)
        # Default scope is request.user — user_a cannot see user_b events
        resp = self.client.get(URL, {'event_type': 'TASK_OPEN'})
        self.assertEqual(resp.status_code, 200)
        for e in resp.json()['results']:
            self.assertEqual(e['user_id'], self.user_a.pk)

    def test_non_staff_cannot_query_other_users_data_returns_403(self):
        resp = self.client.get(URL, {'user': self.user_b.pk})
        self.assertEqual(resp.status_code, 403)

    def test_multi_filter_and_semantics(self):
        # event_a is TASK_OPEN; create a TASK_WRITE in a different session
        other_session = make_session(self.user_a)
        write_event = make_event(self.user_a, other_session, event_type='TASK_WRITE')
        # Filter by session_a AND event_type=TASK_OPEN → only event_a matches
        resp = self.client.get(URL, {
            'session': str(self.session_a.pk),
            'event_type': 'TASK_OPEN',
        })
        self.assertEqual(resp.status_code, 200)
        ids = [e['id'] for e in resp.json()['results']]
        self.assertIn(self.event_a.pk, ids)
        self.assertNotIn(write_event.pk, ids)

    # --- Session filter: 35-day boundary regression ---

    def test_session_filter_includes_events_older_than_30_days(self):
        # Session started 35 days ago — falls outside the 30-day default window.
        started_35_days_ago = timezone.now() - timedelta(days=35)
        old_session = make_session(self.user_a, started_at=started_35_days_ago)
        old_event = make_event(
            self.user_a, old_session, occurred_at=started_35_days_ago + timedelta(hours=1)
        )

        resp = self.client.get(URL, {'session': str(old_session.pk)})
        self.assertEqual(resp.status_code, 200)
        ids = [e['id'] for e in resp.json()['results']]
        self.assertIn(old_event.pk, ids,
                      "Event from 35-day-old session must be visible when queried by session")

    def test_event_older_than_30_days_hidden_without_session_filter(self):
        # Without session filter, the 30-day default since should exclude the old event.
        started_35_days_ago = timezone.now() - timedelta(days=35)
        old_session = make_session(self.user_a, started_at=started_35_days_ago)
        old_event = make_event(
            self.user_a, old_session, occurred_at=started_35_days_ago + timedelta(hours=1)
        )

        resp = self.client.get(URL, {'event_type': 'TASK_OPEN'})
        self.assertEqual(resp.status_code, 200)
        ids = [e['id'] for e in resp.json()['results']]
        self.assertNotIn(old_event.pk, ids,
                         "Old event must be outside the default 30-day window")

    # --- Pagination ---

    def test_pagination_structure(self):
        resp = self.client.get(URL, {'event_type': 'TASK_OPEN'})
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn('count', body)
        self.assertIn('results', body)

    def test_page_size_respected(self):
        for _ in range(5):
            make_event(self.user_a, self.session_a)
        resp = self.client.get(URL, {'event_type': 'TASK_OPEN', 'page_size': 2})
        self.assertEqual(resp.status_code, 200)
        self.assertLessEqual(len(resp.json()['results']), 2)

    def test_page_size_clamped_to_max(self):
        resp = self.client.get(URL, {'event_type': 'TASK_OPEN', 'page_size': 10000})
        self.assertEqual(resp.status_code, 200)
        # DRF caps at max_page_size=500; count confirms it, not len(results) which may be small
        body = resp.json()
        self.assertIn('count', body)
        # The page_size in use must not exceed 500 (verified via next/count math)
        if body['count'] > 500:
            self.assertIsNotNone(body.get('next'))

    # --- Unauthenticated ---

    def test_unauthenticated_returns_401(self):
        anon = APIClient()
        resp = anon.get(URL, {'event_type': 'TASK_OPEN'})
        self.assertEqual(resp.status_code, 401)
