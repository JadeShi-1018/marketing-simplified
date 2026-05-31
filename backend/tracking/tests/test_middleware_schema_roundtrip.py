from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.test import RequestFactory, TestCase, override_settings

from task.tracking_schemas import TaskOpenMeta
from tracking.middleware import ServerSideTrackingMiddleware
from tracking.models import TrackingEvent
from tracking.tasks import emit_tracking_event

User = get_user_model()

LOCMEM_CACHE = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}


@override_settings(CACHES=LOCMEM_CACHE)
class MiddlewareSchemaRoundtripTest(TestCase):
    """
    Hard guard: ensures ServerSideTrackingMiddleware._build_meta fields
    and TaskOpenMeta schema never diverge.

    Strategy: extract _build_meta output directly, push it through
    emit_tracking_event, then assert (a) every key reaches the DB and
    (b) TaskOpenMeta.model_validate() accepts the stored metadata.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            email='roundtrip@test.com', username='roundtrip', password='pw'
        )
        self.factory = RequestFactory()

    def test_build_meta_fields_reach_db_and_validate_against_schema(self):
        request = self.factory.get(
            '/api/tasks/42/',
            HTTP_USER_AGENT='TestAgent/1.0',
            HTTP_REFERER='https://example.com/tasks',
        )
        request.user = self.user

        mw = ServerSideTrackingMiddleware(lambda r: HttpResponse())
        request_meta = mw._build_meta(request)

        emit_tracking_event(self.user.pk, '/api/tasks/42/', 'GET', request_meta)

        event = TrackingEvent.objects.get(event_type='TASK_OPEN')

        # Field set must match exactly: no missing, no extra.
        self.assertEqual(
            set(event.metadata.keys()),
            set(request_meta.keys()),
            "event.metadata key set diverges from _build_meta output",
        )

        # Schema must accept the stored metadata without raising.
        validated = TaskOpenMeta.model_validate(event.metadata)
        self.assertEqual(validated.user_agent, 'TestAgent/1.0')
        self.assertEqual(validated.referer, 'https://example.com/tasks')
        self.assertFalse(validated.internal_refetch)
