import re

from django.core.cache import cache

from tracking.enums import EventType

_TASK_PATH_RE = re.compile(r'^/api/tasks/(\d+)/')
_TASK_OPEN_TTL = 30              # 30-second dedup window
_FIRST_INTERACTION_TTL = 2_592_000  # 30 days — once per user per task
_WRITE_METHODS = frozenset({'POST', 'PATCH', 'PUT', 'DELETE'})


def _get_task(task_id):
    try:
        from task.models import Task
        return Task.objects.get(pk=task_id)
    except Exception:
        return None


def handle_task_request(user_id, request_path, request_method, request_meta):
    """Returns list of {event_type, target, metadata} specs for task-related requests."""
    match = _TASK_PATH_RE.match(request_path)
    if not match:
        return []

    task_id = int(match.group(1))
    method = request_method.upper()
    events = []

    if method == 'GET' and request_path == f'/api/tasks/{task_id}/':
        if request_meta.get('internal_refetch'):
            return []
        dedup_key = f"tracking:last_open:{user_id}:{task_id}"
        if cache.add(dedup_key, '1', timeout=_TASK_OPEN_TTL):
            events.append({
                'event_type': EventType.TASK_OPEN,
                'target': _get_task(task_id),
                'metadata': request_meta,
            })
    elif method in _WRITE_METHODS:
        task = _get_task(task_id)
        if method == 'POST':
            dedup_key = f"tracking:first_interaction:{user_id}:{task_id}"
            if cache.add(dedup_key, '1', timeout=_FIRST_INTERACTION_TTL):
                events.append({
                    'event_type': EventType.FIRST_INTERACTION,
                    'target': task,
                    'metadata': request_meta,
                })
        events.append({
            'event_type': EventType.TASK_WRITE,
            'target': task,
            'metadata': request_meta,
        })
    else:
        return []

    return events
