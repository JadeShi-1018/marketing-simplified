from django.utils import translation
from django.utils import timezone
from django.db import connection


class UserLocaleMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            # CRITICAL: TenantSchemaMiddleware may have switched search_path to a
            # tenant schema. User preferences live in public schema, so temporarily
            # switch back to read them.
            with connection.cursor() as cursor:
                cursor.execute('SHOW search_path')
                original_path = cursor.fetchone()[0]

            # Temporarily switch to public for user metadata
            with connection.cursor() as cursor:
                cursor.execute('SET search_path TO public')

            try:
                preferences = getattr(request.user, 'preferences', None)
                if preferences:
                    # language
                    if preferences.language:
                        translation.activate(preferences.language)
                        request.LANGUAGE_CODE = preferences.language
                    # timezone
                    if preferences.timezone:
                        timezone.activate(preferences.timezone)
            finally:
                # Restore original search_path
                # CRITICAL: Use f-string instead of %s parameter to avoid quoting the path
                with connection.cursor() as cursor:
                    cursor.execute(f'SET search_path TO {original_path}')

        response = self.get_response(request)
        translation.deactivate()
        timezone.deactivate()
        return response
