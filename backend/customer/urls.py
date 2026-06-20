from django.urls import path
from .views import (
    CustomerViewSet, RegionViewSet, CustomerOrganisationViewSet,
    CustomerStatusLabelViewSet, CustomerInternalNoteViewSet,
    CustomerInternalNoteAuditLogViewSet
)

customers_list = CustomerViewSet.as_view({'get': 'list', 'post': 'create'})
customers_detail = CustomerViewSet.as_view({
    'get': 'retrieve',
    'patch': 'partial_update',
    'delete': 'destroy',
})

regions_list = RegionViewSet.as_view({'get': 'list', 'post': 'create'})
regions_detail = RegionViewSet.as_view({
    'get': 'retrieve',
    'patch': 'partial_update',
    'delete': 'destroy',
})

organisations_lest = CustomerOrganisationViewSet.as_view({'get':'list','post':'create'})
organisations_detial = CustomerOrganisationViewSet.as_view({
    'get': 'retrieve',
    'patch': 'partial_update',
    'delete': 'destroy',
})
organisations_my_admin = CustomerOrganisationViewSet.as_view({'get': 'my_admin_orgs'})

status_labels_list = CustomerStatusLabelViewSet.as_view({'get': 'list', 'post': 'create'})
status_labels_detail = CustomerStatusLabelViewSet.as_view({
    'get': 'retrieve',
    'patch': 'partial_update',
    'delete': 'destroy',
})

internal_notes_list = CustomerInternalNoteViewSet.as_view({'get': 'list', 'post': 'create'})
internal_notes_detail = CustomerInternalNoteViewSet.as_view({
    'get': 'retrieve',
    'patch': 'partial_update',
    'delete': 'destroy',
})

audit_logs_list = CustomerInternalNoteAuditLogViewSet.as_view({'get': 'list'})
audit_logs_detail = CustomerInternalNoteAuditLogViewSet.as_view({'get': 'retrieve'})

urlpatterns = [
    path('customers/', customers_list, name='customer-list'),
    path('customers/<int:pk>/', customers_detail, name='customer-detail'),
    path('regions/', regions_list, name='region-list'),
    path('regions/<int:pk>/', regions_detail, name='region-detail'),
    path('organisations/', organisations_lest, name='organisation-list'),
    path('organisations/my-admin-orgs/', organisations_my_admin, name='organisation-my-admin-orgs'),
    path('organisations/<int:pk>/', organisations_detial, name='organisation-detail'),
    path('customer-status-labels/', status_labels_list, name='customer-status-label-list'),
    path('customer-status-labels/<int:pk>/', status_labels_detail, name='customer-status-label-detail'),
    path('customer-internal-notes/', internal_notes_list, name='customer-internal-note-list'),
    path('customer-internal-notes/<int:pk>/', internal_notes_detail, name='customer-internal-note-detail'),
    path('customer-internal-note-audit-logs/', audit_logs_list, name='customer-internal-note-audit-log-list'),
    path('customer-internal-note-audit-logs/<uuid:pk>/', audit_logs_detail, name='customer-internal-note-audit-log-detail'),
]
