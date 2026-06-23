from django.urls import path, include
from rest_framework.routers import DefaultRouter

from core.views import (
    ApproveProjectInvitationView,
    AcceptInvitationView,
    CheckProjectMembershipView,
    KPISuggestionsView,
    ListMyProjectInvitationsView,
    ListProjectInvitationsView,
    ListPendingInvitationApprovalsView,
    ListProjectAvailableRolesView,
    ProjectMemberViewSet,
    ProjectOnboardingView,
    ProjectViewSet,
    RejectProjectInvitationView,
    ResendInvitationView,
)
from core.admin_views import AdminOrganizationViewSet
from core.quick_start_views import QuickStartConfirmView, QuickStartPreviewView

router = DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')
router.register(
    r'projects/(?P<project_id>[^/.]+)/members',
    ProjectMemberViewSet,
    basename='project-member'
)
router.register(r'admin/organizations', AdminOrganizationViewSet, basename='admin-organization')

urlpatterns = [
    path('check-project-membership/', CheckProjectMembershipView.as_view(), name='check-project-membership'),
    path('projects/onboarding/', ProjectOnboardingView.as_view(), name='project-onboarding'),
    path(
        'projects/quick-start/preview/',
        QuickStartPreviewView.as_view(),
        name='quick-start-preview',
    ),
    path(
        'projects/quick-start/confirm/',
        QuickStartConfirmView.as_view(),
        name='quick-start-confirm',
    ),
    path('kpi-suggestions/', KPISuggestionsView.as_view(), name='kpi-suggestions'),
    # Invitation endpoints
    path('invitations/accept/', AcceptInvitationView.as_view(), name='accept-invitation'),
    path('invitations/pending/', ListMyProjectInvitationsView.as_view(), name='list-my-project-invitations'),
    path('invitations/<int:invitation_id>/resend/', ResendInvitationView.as_view(), name='resend-invitation'),
    path('projects/<str:project_id>/invitations/', ListProjectInvitationsView.as_view(), name='list-project-invitations'),
    path('projects/<str:project_id>/invitations/pending-approval/', ListPendingInvitationApprovalsView.as_view(), name='list-pending-invitation-approvals'),
    path('projects/<str:project_id>/invitations/<int:invitation_id>/approve/', ApproveProjectInvitationView.as_view(), name='approve-project-invitation'),
    path('projects/<str:project_id>/invitations/<int:invitation_id>/reject/', RejectProjectInvitationView.as_view(), name='reject-project-invitation'),
    path('projects/<str:project_id>/roles/', ListProjectAvailableRolesView.as_view(), name='list-project-roles'),
    path('', include(router.urls)),
]
