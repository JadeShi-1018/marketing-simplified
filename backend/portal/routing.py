from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/portal/conversations/(?P<conversation_id>\d+)/$', consumers.PortalConversationConsumer.as_asgi()),
]
