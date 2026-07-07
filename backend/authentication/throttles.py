from rest_framework.throttling import BaseThrottle

from .login_security import LoginIdentifier, LoginSecurityResponse, LoginSecurityService
from .models import AuthenticationLockout


class LoginThrottleBase(BaseThrottle):
    scope = None
    security_response: LoginSecurityResponse | None = None

    def get_login_identifier(self, request, username: str | None) -> LoginIdentifier | None:
        raise NotImplementedError

    def allow_request(self, request, view) -> bool:
        username = getattr(request, 'data', {}).get('email')
        self.security_response = self.check_request_allowed(request, username)
        return self.security_response is None

    def check_request_allowed(
        self,
        request,
        username: str | None,
    ) -> LoginSecurityResponse | None:
        identifier = self.get_login_identifier(request, username)
        if identifier is None:
            return None
        return LoginSecurityService.check_request_allowed([identifier])

    def wait(self) -> int | None:
        if not self.security_response:
            return None
        return self.security_response.payload.get('retry_after_seconds')


class LoginIPThrottle(LoginThrottleBase):
    scope = AuthenticationLockout.Scope.IP

    def get_login_identifier(self, request, username: str | None) -> LoginIdentifier:
        return LoginIdentifier(self.scope, LoginSecurityService.get_client_ip(request))


class LoginUsernameThrottle(LoginThrottleBase):
    scope = AuthenticationLockout.Scope.USERNAME

    def get_login_identifier(self, request, username: str | None) -> LoginIdentifier | None:
        normalized_username = LoginSecurityService.normalize_username(username)
        if not normalized_username:
            return None
        return LoginIdentifier(self.scope, normalized_username)
