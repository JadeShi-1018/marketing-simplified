from prometheus_client import Counter, Histogram

tracking_events_total = Counter(
    'tracking_events_total',
    'Total tracking events processed',
    ['source', 'event_type', 'reason'],  # reason: ok | schema_invalid | duplicate
)

tracking_ingest_latency_seconds = Histogram(
    'tracking_ingest_latency_seconds',
    'ingest_event call latency in seconds',
    ['source'],
)
