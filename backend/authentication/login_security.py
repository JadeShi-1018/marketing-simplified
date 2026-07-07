import hashlib
from dataclasses import dataclass
from datetime import timedelta
from typing import Iterable

from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone
from rest_framework import status

from .models import AuthenticationLockout


@dataclass(frozen=True)
class LoginIdentifier:
    scope: str
    value: str


@dataclass(frozen=True)
class LoginSecurityResponse:
    status_code: int
    payload: dict


class LoginSecurityService:
    FAILURE_WINDOW_SECONDS = 5 * 60
    BACKOFF_THRESHOLD = 5
    BACKOFF_SECONDS = 60
    LOCKOUT_THRESHOLD = 10
    LOCKOUT_WINDOW_SECONDS = 5 * 60
    LOCKOUT_SECONDS = 5 * 60

    TOO_MANY_ATTEMPTS_CODE = 'TOO_MANY_ATTEMPTS'
    LOGIN_LOCKED_CODE = 'LOGIN_LOCKED'
    LOCKOUT_REASON = 'sustained_login_failures'

    @classmethod
    def normalize_username(cls, username: str | None) -> str:
        return (username or '').strip().lower()

    @classmethod
    def get_client_ip(cls, request) -> str:
        forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR', '') or 'unknown'

    @classmethod
    def build_identifiers(cls, request, username: str | None) -> list[LoginIdentifier]:
        identifiers = [
            LoginIdentifier(AuthenticationLockout.Scope.IP, cls.get_client_ip(request)),
        ]
        normalized_username = cls.normalize_username(username)
        if normalized_username:
            identifiers.append(LoginIdentifier(AuthenticationLockout.Scope.USERNAME, normalized_username))
        return identifiers

    @classmethod
    def check_request_allowed(cls, identifiers: Iterable[LoginIdentifier]) -> LoginSecurityResponse | None:
        identifiers = list(identifiers)
        lockout_response = cls._active_lockout_response(identifiers)
        if lockout_response:
            return lockout_response

        blocked_identifiers = []
        retry_after_seconds = 0
        now_ts = timezone.now().timestamp()
        for identifier in identifiers:
            backoff_until = cache.get(cls._backoff_key(identifier))
            if not backoff_until:
                continue
            remaining = int(float(backoff_until) - now_ts)
            if remaining > 0:
                blocked_identifiers.append(identifier)
                retry_after_seconds = max(retry_after_seconds, remaining)

        if not blocked_identifiers:
            return None

        lockout_response = cls._record_abuse_and_lockout_if_needed(identifiers)
        if lockout_response:
            return lockout_response

        return cls._too_many_attempts_response(max(1, retry_after_seconds))

    @classmethod
    def record_failed_login(cls, identifiers: Iterable[LoginIdentifier]) -> LoginSecurityResponse | None:
        identifiers = list(identifiers)
        failure_counts = {
            identifier: cls._increment_counter(
                cls._failure_key(identifier),
                cls.FAILURE_WINDOW_SECONDS,
            )
            for identifier in identifiers
        }

        lockout_response = cls._record_abuse_and_lockout_if_needed(identifiers)
        if lockout_response:
            return lockout_response

        if any(count >= cls.BACKOFF_THRESHOLD for count in failure_counts.values()):
            backoff_until = timezone.now() + timedelta(seconds=cls.BACKOFF_SECONDS)
            for identifier, count in failure_counts.items():
                if count >= cls.BACKOFF_THRESHOLD:
                    cache.set(
                        cls._backoff_key(identifier),
                        backoff_until.timestamp(),
                        timeout=cls.BACKOFF_SECONDS,
                    )
            return cls._too_many_attempts_response(cls.BACKOFF_SECONDS)

        return None

    @classmethod
    def clear_successful_login(cls, identifiers: Iterable[LoginIdentifier]) -> None:
        for identifier in identifiers:
            cache.delete(cls._failure_key(identifier))
            cache.delete(cls._abuse_key(identifier))
            cache.delete(cls._backoff_key(identifier))

    @classmethod
    def _record_abuse_and_lockout_if_needed(
        cls,
        identifiers: Iterable[LoginIdentifier],
    ) -> LoginSecurityResponse | None:
        now = timezone.now()
        lockout_until = now + timedelta(seconds=cls.LOCKOUT_SECONDS)
        for identifier in identifiers:
            abuse_count = cls._increment_counter(
                cls._abuse_key(identifier),
                cls.LOCKOUT_WINDOW_SECONDS,
            )
            if abuse_count < cls.LOCKOUT_THRESHOLD:
                continue

            lockout = AuthenticationLockout.objects.filter(
                scope=identifier.scope,
                identifier=identifier.value,
                resolved_at__isnull=True,
                locked_until__gt=now,
            ).order_by('-locked_until').first()
            if not lockout:
                lockout = AuthenticationLockout.objects.create(
                    scope=identifier.scope,
                    identifier=identifier.value,
                    reason=cls.LOCKOUT_REASON,
                    failure_count=abuse_count,
                    locked_until=lockout_until,
                    last_attempt_at=now,
                    metadata={'source': 'auth_login'},
                )
            if lockout.locked_until < lockout_until or lockout.failure_count < abuse_count:
                lockout.locked_until = lockout_until
                lockout.failure_count = abuse_count
                lockout.last_attempt_at = now
                lockout.reason = cls.LOCKOUT_REASON
                lockout.save(update_fields=[
                    'locked_until',
                    'failure_count',
                    'last_attempt_at',
                    'reason',
                    'updated_at',
                ])
            return cls._lockout_response(lockout)
        return None

    @classmethod
    def _active_lockout_response(
        cls,
        identifiers: Iterable[LoginIdentifier],
    ) -> LoginSecurityResponse | None:
        now = timezone.now()
        query = Q()
        for identifier in identifiers:
            query |= Q(scope=identifier.scope, identifier=identifier.value)
        if not query:
            return None
        lockout = AuthenticationLockout.objects.filter(
            query,
            resolved_at__isnull=True,
            locked_until__gt=now,
        ).order_by('-locked_until').first()
        if not lockout:
            return None
        return cls._lockout_response(lockout)

    @classmethod
    def _too_many_attempts_response(cls, retry_after_seconds: int) -> LoginSecurityResponse:
        return LoginSecurityResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            payload={
                'error': 'Too many login attempts. Please wait before trying again.',
                'errorCode': cls.TOO_MANY_ATTEMPTS_CODE,
                'retry_after_seconds': retry_after_seconds,
                'requires_captcha': True,
            },
        )

    @classmethod
    def _lockout_response(cls, lockout: AuthenticationLockout) -> LoginSecurityResponse:
        return LoginSecurityResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            payload={
                'error': 'Login temporarily locked due to repeated failed attempts.',
                'errorCode': cls.LOGIN_LOCKED_CODE,
                'lockout_until': lockout.locked_until.isoformat(),
                'retry_after_seconds': lockout.seconds_remaining,
                'requires_captcha': True,
            },
        )

    @classmethod
    def _increment_counter(cls, key: str, timeout: int) -> int:
        count = int(cache.get(key, 0)) + 1
        cache.set(key, count, timeout=timeout)
        return count

    @classmethod
    def _failure_key(cls, identifier: LoginIdentifier) -> str:
        return f'auth:login:fail:{identifier.scope}:{cls._hash(identifier.value)}'

    @classmethod
    def _abuse_key(cls, identifier: LoginIdentifier) -> str:
        return f'auth:login:abuse:{identifier.scope}:{cls._hash(identifier.value)}'

    @classmethod
    def _backoff_key(cls, identifier: LoginIdentifier) -> str:
        return f'auth:login:backoff:{identifier.scope}:{cls._hash(identifier.value)}'

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(value.encode('utf-8')).hexdigest()
