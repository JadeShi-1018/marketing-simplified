from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .runtime_views import ChannelRuntimeConfigView, ExperienceGroupChannelsView
from .views import PortalRegisterView, PortalConversationViewSet

router = DefaultRouter()
router.register(r'conversations', PortalConversationViewSet, basename='portal-conversation')

urlpatterns = [
    path('register/', PortalRegisterView.as_view(), name='portal-register'),
    path(
        'channels/<str:lookup>/config/',
        ChannelRuntimeConfigView.as_view(),
        name='portal-channel-config',
    ),
    path(
        'experience-groups/<int:eg_id>/channels/',
        ExperienceGroupChannelsView.as_view(),
        name='portal-eg-channels',
    ),
    path('', include(router.urls)),
]
