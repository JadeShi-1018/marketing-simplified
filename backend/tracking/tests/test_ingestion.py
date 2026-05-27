import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from pydantic import BaseModel

from tracking.enums import EventType, Source
from tracking.models import TrackingEvent
from tracking.schema_registry import SchemaRegistry
from tracking.services import ingest_event

User = get_user_model()

LOCMEM_CACHE = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

BASE_META = {
    'user_agent': 'TestAgent/1.0',
    'referer': '',
    'view_name': None,
    'project_id': None,
    'internal_refetch': False,
}


@override_settings(CACHES=LOCMEM_CACHE)
class IngestEventTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            email='ingest@test.com', username='ingest', password='pw'
        )

    def test_middleware_source_creates_event(self):
        result = ingest_event(
            source=Source.MIDDLEWARE,
            event_type=EventType.TASK_OPEN,
            user=self.user,
            metadata=dict(BASE_META),
        )
        self.assertIsNotNone(result)
        self.assertEqual(TrackingEvent.objects.count(), 1)
        event = TrackingEvent.objects.get()
        self.assertEqual(event.source, Source.MIDDLEWARE)
        self.assertEqual(event.event_type, EventType.TASK_OPEN)

    def test_explicit_source_creates_event(self):
        result = ingest_event(
            source=Source.EXPLICIT,
            event_type=EventType.TASK_WRITE,
            user=self.user,
            metadata=dict(BASE_META),
        )
        self.assertIsNotNone(result)
        self.assertEqual(TrackingEvent.objects.count(), 1)
        self.assertEqual(TrackingEvent.objects.get().source, Source.EXPLICIT)

    def test_client_source_creates_event(self):
        # No endpoint exists this release, but the code path must be reachable.
        result = ingest_event(
            source=Source.CLIENT,
            event_type=EventType.TASK_OPEN,
            user=self.user,
            metadata=dict(BASE_META),
        )
        self.assertIsNotNone(result)
        self.assertEqual(TrackingEvent.objects.count(), 1)
        self.assertEqual(TrackingEvent.objects.get().source, Source.CLIENT)

    def test_dedup_same_client_event_id_does_not_double_insert(self):
        dedup_id = uuid.uuid4()
        ingest_event(
            source=Source.MIDDLEWARE,
            event_type=EventType.TASK_OPEN,
            user=self.user,
            metadata=dict(BASE_META),
            client_event_id=dedup_id,
        )
        ingest_event(
            source=Source.MIDDLEWARE,
            event_type=EventType.TASK_OPEN,
            user=self.user,
            metadata=dict(BASE_META),
            client_event_id=dedup_id,
        )
        self.assertEqual(TrackingEvent.objects.filter(client_event_id=dedup_id).count(), 1)

    @patch('tracking.services.ingestion._ingest_counter')
    def test_validate_fail_emits_schema_invalid_metric_and_does_not_insert(self, mock_counter):
        class RequiredMeta(BaseModel):
            must_have: str  # no default — missing key raises ValidationError

        local_registry = SchemaRegistry()
        local_registry.register('STRICT_EVENT', RequiredMeta)

        with patch('tracking.services.ingestion.registry', local_registry):
            result = ingest_event(
                source=Source.MIDDLEWARE,
                event_type='STRICT_EVENT',
                user=self.user,
                metadata={},  # missing 'must_have'
            )

        self.assertIsNone(result)
        self.assertEqual(TrackingEvent.objects.count(), 0)
        mock_counter.labels.assert_called_with(
            source=str(Source.MIDDLEWARE),
            event_type='STRICT_EVENT',
            reason='schema_invalid',
        )
        mock_counter.labels.return_value.inc.assert_called_once()
