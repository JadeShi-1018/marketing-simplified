from rest_framework.routers import DefaultRouter

from .views import FocusSessionViewSet

app_name = "behavioral_tracking"

router = DefaultRouter()
router.register(r"sessions", FocusSessionViewSet, basename="focus-session")

urlpatterns = router.urls
