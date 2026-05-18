from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import FocusSession
from .serializers import (
    BehavioralSignalBatchSerializer,
    BehavioralSignalSerializer,
    FocusSessionCreateSerializer,
    FocusSessionSerializer,
)
from .services import BehavioralTrackingService


@method_decorator(csrf_exempt, name="dispatch")
class FocusSessionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated]
    serializer_class = FocusSessionSerializer

    def get_queryset(self):
        qs = FocusSession.objects.filter(user=self.request.user).select_related(
            "task", "user"
        )
        task_id = self.request.query_params.get("task_id")
        if task_id:
            qs = qs.filter(task_id=task_id)
        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return FocusSessionCreateSerializer
        return FocusSessionSerializer

    def create(self, request, *args, **kwargs):
        in_ser = FocusSessionCreateSerializer(data=request.data)
        in_ser.is_valid(raise_exception=True)
        session = BehavioralTrackingService.start_session(
            user=request.user, task=in_ser.validated_data["task"]
        )
        return Response(
            FocusSessionSerializer(session).data, status=status.HTTP_201_CREATED
        )

    def _get_owned_session(self, pk):
        return get_object_or_404(FocusSession, pk=pk, user=self.request.user)

    @action(detail=True, methods=["post"], url_path="end")
    def end(self, request, pk=None):
        session = self._get_owned_session(pk)
        ended = BehavioralTrackingService.end_session(session)
        return Response(FocusSessionSerializer(ended).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"], url_path="signals")
    def signals(self, request, pk=None):
        session = self._get_owned_session(pk)

        if request.method == "GET":
            qs = session.signals.all()
            page = self.paginate_queryset(qs)
            if page is not None:
                return self.get_paginated_response(
                    BehavioralSignalSerializer(page, many=True).data
                )
            return Response(BehavioralSignalSerializer(qs, many=True).data)

        batch = BehavioralSignalBatchSerializer(data=request.data)
        batch.is_valid(raise_exception=True)
        try:
            created = BehavioralTrackingService.ingest_signals(
                session=session, items=batch.validated_data["signals"]
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(
            BehavioralSignalSerializer(created, many=True).data,
            status=status.HTTP_201_CREATED,
        )
