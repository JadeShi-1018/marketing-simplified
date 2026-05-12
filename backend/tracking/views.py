from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db.models import Count, F, Max, Min, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from tracking.enums import EventType
from tracking.models import TrackingEvent, TrackingSession


class ConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "idle_seconds": settings.TRACKING_IDLE_SECONDS,
            "heartbeat_seconds": settings.TRACKING_HEARTBEAT_SECONDS,
            "session_timeout_seconds": settings.TRACKING_SESSION_TIMEOUT_SECONDS,
            "event_flush_seconds": settings.TRACKING_EVENT_FLUSH_SECONDS,
        })


class SessionCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({"stub": True})


class HeartbeatView(APIView):
    permission_classes = [IsAuthenticated]

    MAX_DELTA = 600

    def post(self, request, pk):
        delta = request.data.get('active_delta_seconds', 0)
        if not isinstance(delta, int) or delta < 0 or delta > self.MAX_DELTA:
            return Response(
                {"error": "active_delta_seconds must be an integer between 0 and 600"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated = TrackingSession.objects.filter(
            pk=pk,
            user=request.user,
            ended_at__isnull=True,
        ).update(
            active_seconds=F('active_seconds') + delta,
            last_heartbeat_at=timezone.now(),
        )

        if updated == 0:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response({"ok": True})


class SessionEndView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        session = get_object_or_404(TrackingSession, pk=pk, user=request.user)

        if session.ended_at is not None:
            return Response(status=status.HTTP_200_OK)

        end_reason = request.data.get('end_reason', 'CLOSED')
        if end_reason != 'CLOSED':
            return Response(
                {"error": "end_reason must be CLOSED"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        delta = request.data.get('active_delta_seconds', 0)
        if not isinstance(delta, int) or delta < 0 or delta > HeartbeatView.MAX_DELTA:
            return Response(
                {"error": "active_delta_seconds must be an integer between 0 and 600"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        TrackingSession.objects.filter(pk=pk, user=request.user, ended_at__isnull=True).update(
            ended_at=timezone.now(),
            end_reason=end_reason,
            active_seconds=F('active_seconds') + delta,
        )
        return Response(status=status.HTTP_200_OK)


class EventBulkCreateView(APIView):
    permission_classes = [IsAuthenticated]
    MAX_EVENTS = 100

    def post(self, request):
        session_id = request.data.get('session_id')
        events_data = request.data.get('events', [])

        if not isinstance(events_data, list):
            return Response({"error": "events must be a list"}, status=status.HTTP_400_BAD_REQUEST)
        if len(events_data) > self.MAX_EVENTS:
            return Response(
                {"error": f"events cannot exceed {self.MAX_EVENTS} items"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            session = TrackingSession.objects.get(pk=session_id, user=request.user, ended_at__isnull=True)
        except (TrackingSession.DoesNotExist, Exception):
            return Response({"error": "session not found or already ended"}, status=status.HTTP_400_BAD_REQUEST)

        if not events_data:
            return Response({"accepted": 0})

        valid_event_types = set(EventType.values)
        for event in events_data:
            if event.get('event_type') not in valid_event_types:
                return Response(
                    {"error": f"invalid event_type: {event.get('event_type')}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Prequery all needed ContentTypes in one DB hit
        unique_ct_names = {e.get('content_type') for e in events_data}
        ct_map = {ct.model: ct for ct in ContentType.objects.filter(model__in=unique_ct_names)}
        for ct_name in unique_ct_names:
            if ct_name not in ct_map:
                return Response(
                    {"error": f"unknown content_type: {ct_name}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        objs = []
        for event in events_data:
            occurred_at = parse_datetime(event.get('occurred_at', '')) if isinstance(event.get('occurred_at'), str) else event.get('occurred_at')
            objs.append(TrackingEvent(
                session=session,
                user=request.user,
                content_type=ct_map[event['content_type']],
                object_id=event.get('object_id'),
                event_type=event['event_type'],
                occurred_at=occurred_at,
                metadata=event.get('metadata', {}),
                project_id=event.get('project_id'),
                client_event_id=event['client_event_id'],
            ))

        TrackingEvent.objects.bulk_create(objs, ignore_conflicts=True)
        return Response({"accepted": len(events_data)})


class TaskEngagementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        ct = ContentType.objects.get(app_label='task', model='task')

        agg = TrackingEvent.objects.filter(
            user=request.user,
            content_type=ct,
            object_id=task_id,
        ).aggregate(
            open_count=Count('id', filter=Q(event_type='TASK_OPEN')),
            first_interaction_at=Min('occurred_at', filter=Q(event_type='FIRST_INTERACTION')),
            last_open_at=Max('occurred_at', filter=Q(event_type='TASK_OPEN')),
            idle_event_count=Count('id', filter=Q(event_type='IDLE_START')),
        )

        session_ids = TrackingEvent.objects.filter(
            user=request.user,
            content_type=ct,
            object_id=task_id,
        ).values_list('session_id', flat=True).distinct()

        total_active_seconds = (
            TrackingSession.objects.filter(id__in=session_ids)
            .aggregate(s=Sum('active_seconds'))['s'] or 0
        )

        return Response({
            'task_id': task_id,
            'open_count': agg['open_count'],
            'first_interaction_at': agg['first_interaction_at'],
            'last_open_at': agg['last_open_at'],
            'total_active_seconds': total_active_seconds,
            'idle_event_count': agg['idle_event_count'],
        })
