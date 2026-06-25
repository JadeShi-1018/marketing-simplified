 # experience_group/urls.py
from django.urls import path
from .views import ExperienceGroupViewSet
urlpatterns = [
    path(
        'experience-groups/',
        ExperienceGroupViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='experience-group-list',
    ),
    path(
        'experience-groups/<str:pk>/',
        ExperienceGroupViewSet.as_view({'get': 'retrieve', 'patch': 'partial_update', 'delete': 'destroy'}),
        name='experience-group-detail',
    ),
    path(
        'experience-groups/<str:pk>/publish/',
        ExperienceGroupViewSet.as_view({'post': 'publish'}),
        name='experience-group-publish',
    ),
    path(
        'experience-groups/<str:pk>/preview/',
        ExperienceGroupViewSet.as_view({'get': 'preview'}),
        name='experience-group-preview',
    ),
    path(
        'experience-groups/<str:pk>/request-form/',
        ExperienceGroupViewSet.as_view({'get': 'request_form'}),
        name='experience-group-request-form',
    ),
    path(
        'experience-groups/<str:pk>/submit-request/',
        ExperienceGroupViewSet.as_view({'post': 'submit_request'}),
        name='experience-group-submit-request',
    ),
]