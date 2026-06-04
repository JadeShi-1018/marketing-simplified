from django.urls import path
from .views import CustomerViewSet, RegionViewSet,CustomerOrganisationViewSet

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

urlpatterns = [
    path('customers/', customers_list, name='customer-list'),
    path('customers/<int:pk>/', customers_detail, name='customer-detail'),
    path('regions/', regions_list, name='region-list'),
    path('regions/<int:pk>/', regions_detail, name='region-detail'),
    path('organisations/', organisations_lest, name='organisation-list'),
    path('organisations/my-admin-orgs/', organisations_my_admin, name='organisation-my-admin-orgs'),
    path('organisations/<int:pk>/', organisations_detial, name='organisation-detail'),

]
