"""Pytest configuration for experiment tests."""
import os
import pytest

# Disable OpenTelemetry in test environment
os.environ['OTEL_ENABLED'] = 'False'

@pytest.fixture(autouse=True)
def configure_test_cache(settings):
    """Use a dummy cache for experiment tests without leaking into other modules."""
    settings.CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
        }
    }
