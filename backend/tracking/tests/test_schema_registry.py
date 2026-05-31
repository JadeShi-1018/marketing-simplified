from django.test import TestCase
from pydantic import BaseModel, ValidationError

from tracking.schema_registry import SchemaRegistry, registry


class SampleMeta(BaseModel):
    name: str
    count: int = 0


class SchemaRegistryTests(TestCase):

    def setUp(self):
        self.registry = SchemaRegistry()

    def test_registry_is_singleton(self):
        from tracking.schema_registry import registry as r1
        from tracking.schema_registry import registry as r2
        self.assertIs(r1, r2)

    def test_register_and_validate_passes(self):
        self.registry.register('TEST_EVENT', SampleMeta)
        result = self.registry.validate('TEST_EVENT', {'name': 'hello', 'count': 3})
        self.assertEqual(result, {'name': 'hello', 'count': 3})

    def test_validate_unknown_event_type_returns_payload_and_warns(self):
        payload = {'foo': 'bar'}
        with self.assertLogs('tracking.schema_registry', level='WARNING') as log:
            result = self.registry.validate('UNKNOWN_EVENT', payload)
        self.assertEqual(result, payload)
        self.assertTrue(any('UNKNOWN_EVENT' in msg for msg in log.output))

    def test_validate_invalid_payload_raises_validation_error(self):
        self.registry.register('TEST_EVENT', SampleMeta)
        with self.assertRaises(ValidationError):
            self.registry.validate('TEST_EVENT', {'name': 'hello', 'count': 'not_an_int'})
