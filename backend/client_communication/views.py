from rest_framework import generics, permissions
from django.shortcuts import get_object_or_404

from task.models import Task
from core.slug_mixins import resolve_pk_for
from .models import ClientCommunication
from .serializers import (
    ClientCommunicationSerializer,
    ClientCommunicationCreateSerializer,
)


class ClientCommunicationListCreateView(generics.ListCreateAPIView):
    """
    List and create client communications tied to tasks.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        task_pk = resolve_pk_for(Task, self.request.query_params.get("task_id"))
        queryset = ClientCommunication.objects.all()
        if task_pk:
            queryset = queryset.filter(task_id=task_pk)
        return queryset

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ClientCommunicationCreateSerializer
        return ClientCommunicationSerializer

    def perform_create(self, serializer):
        task_id = serializer.validated_data.get("task")
        task = get_object_or_404(Task, id=task_id)
        comm = serializer.save(task=task)
        task.link_to_object(comm)
        task.save()


class ClientCommunicationDetailView(generics.RetrieveUpdateAPIView):
    """
    Retrieve and update a single client communication.
    """

    permission_classes = [permissions.IsAuthenticated]
    queryset = ClientCommunication.objects.all()
    serializer_class = ClientCommunicationSerializer

