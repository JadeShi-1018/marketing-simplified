from rest_framework.routers import DefaultRouter

from .views import AdCopyVariationViewSet


router = DefaultRouter()
router.register(r'variations', AdCopyVariationViewSet, basename='ad-copy-variation')

urlpatterns = router.urls
