"""Prometheus metrics for chat delivery.

Scraped through django_prometheus alongside the rest of the application's
metrics.
"""

from prometheus_client import Counter

chat_broadcast_enqueue_failures_total = Counter(
    'chat_broadcast_enqueue_failures_total',
    'Chat events that were persisted but could not be queued for realtime broadcast',
    ['event'],  # event: message | pin
)
