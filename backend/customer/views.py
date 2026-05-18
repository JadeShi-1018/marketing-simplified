from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.select_related('experience_group').all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.action == 'list':
            project_id = self.request.query_params.get('project')
            if project_id:
                return Customer.objects.select_related('experience_group').filter(
                    project_id=project_id
                )
            return Customer.objects.none()
        return Customer.objects.select_related('experience_group').all()                                                                                                                            
                                                                                                                                                             
    def perform_create(self, serializer):                                                                                                                         
        serializer.save(                                                                                                                                       
            project_id=self.request.query_params.get('project'),
        )
    
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
