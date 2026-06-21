"""Browser-facing /messages URL builders."""
from urllib.parse import urlencode


def build_messages_action_url(
    slug: str,
    *,
    message_id=None,
    parent_message_id=None,
    thread_message_id=None,
) -> str:
    """Build canonical `/messages/<slug>` action URLs for notifications."""
    params = {}
    if parent_message_id is not None and thread_message_id is not None:
        params['messageId'] = str(parent_message_id)
        params['threadMessageId'] = str(thread_message_id)
    elif message_id is not None:
        params['messageId'] = str(message_id)
    qs = urlencode(params)
    return f"/messages/{slug}" + (f"?{qs}" if qs else "")
