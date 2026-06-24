from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PortalRegisterView, PortalConversationViewSet

router = DefaultRouter()
router.register(r'conversations', PortalConversationViewSet, basename='portal-conversation')

urlpatterns = [
    path('register/', PortalRegisterView.as_view(), name='portal-register'),
    path('', include(router.urls)),
]
