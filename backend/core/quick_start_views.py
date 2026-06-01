"""API views for Quick Start project creation."""

import logging

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.quick_start_serializers import (
    QuickStartConfirmRequestSerializer,
    QuickStartPreviewRequestSerializer,
)
from core.services.quick_start.confirm import QuickStartConfirmService
from core.services.quick_start.exceptions import (
    QuickStartConfigurationError,
    QuickStartLLMError,
    QuickStartValidationError,
)
from core.services.quick_start.preview import QuickStartPreviewService
from core.services.quick_start.user_messages import (
    USER_MESSAGE_CONFIGURATION,
    USER_MESSAGE_GENERIC,
    llm_error_response,
    user_message_for_validation_error,
)

logger = logging.getLogger(__name__)


def _serializer_errors_to_detail(errors) -> str:
    """Flatten DRF serializer errors into one string for user_message_for_validation_error."""
    if not errors:
        return 'Invalid request.'
    for key in ('non_field_errors', 'prompt', 'supplement', 'step'):
        if key in errors:
            value = errors[key]
            if isinstance(value, list) and value:
                return str(value[0])
            return str(value)
    first_key = next(iter(errors))
    value = errors[first_key]
    if isinstance(value, list) and value:
        return str(value[0])
    return str(value)


def _validation_error_response(detail: str) -> Response:
    error_code, user_message = user_message_for_validation_error(detail)
    status_code = (
        status.HTTP_400_BAD_REQUEST
        if error_code == 'validation_failed'
        else status.HTTP_502_BAD_GATEWAY
    )
    return Response(
        llm_error_response(error_code=error_code, user_message=user_message),
        status=status_code,
    )


@method_decorator(csrf_exempt, name='dispatch')
class QuickStartPreviewView(APIView):
    """
    POST /api/core/projects/quick-start/preview/

    Generate a read-only outline and blueprint from user prompts (no DB writes).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = QuickStartPreviewRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _validation_error_response(_serializer_errors_to_detail(serializer.errors))
        data = serializer.validated_data

        service = QuickStartPreviewService()
        try:
            payload = service.generate_preview(
                step=data['step'],
                prompt=data['prompt'],
                supplement=data.get('supplement'),
                chips=data.get('chips'),
                selected_modules=data.get('selected_modules'),
                locale=data.get('locale'),
            )
        except QuickStartValidationError as exc:
            return _validation_error_response(str(exc))
        except QuickStartConfigurationError as exc:
            logger.warning('Quick Start configuration error: %s', exc)
            return Response(
                llm_error_response(
                    error_code='configuration_error',
                    user_message=USER_MESSAGE_CONFIGURATION,
                ),
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except QuickStartLLMError as exc:
            logger.warning('Quick Start preview LLM error: %s', exc)
            return Response(
                llm_error_response(
                    error_code=exc.error_code,
                    user_message=exc.user_message,
                    retry_after_seconds=exc.retry_after_seconds,
                ),
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception:
            logger.exception('Quick Start preview unexpected error')
            return Response(
                llm_error_response(
                    error_code='llm_generation_failed',
                    user_message=USER_MESSAGE_GENERIC,
                ),
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(payload, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name='dispatch')
class QuickStartConfirmView(APIView):
    """
    POST /api/core/projects/quick-start/confirm/

    Persist project and enabled modules from a confirmed blueprint.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = QuickStartConfirmRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        service = QuickStartConfirmService()
        try:
            payload = service.confirm(
                user=request.user,
                blueprint=data['blueprint'],
                project_title=data.get('project_title') or None,
                selected_modules=data.get('selected_modules'),
            )
        except QuickStartValidationError as exc:
            return Response(
                {'error': 'validation_failed', 'detail': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except QuickStartConfigurationError as exc:
            return Response(
                {'error': 'configuration_error', 'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(payload, status=status.HTTP_201_CREATED)
