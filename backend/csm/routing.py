from django.urls import re_path
from .consumers import CsmConversationConsumer

websocket_urlpatterns = [
    re_path(r'ws/csm/agent/(?P<user_id>\d+)/$', CsmConversationConsumer.as_asgi()),
]
