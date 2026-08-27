from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models.user import User
from app.schemas.auth import AuthenticatedUser, LoginRequest, LoginResponse
from app.services.identity import normalize_email, normalize_student_id
from app.services.jwt import JwtService
from app.services.password import PasswordService
from app.services.rate_limit import LoginRateLimiter
from app.services.session import SessionService


@dataclass(frozen=True, slots=True)
class AuthResult:
    response: LoginResponse
    refresh_credential: str | None
    refresh_expires_at: datetime


def invalid_credentials_error() -> ApiError:
    return ApiError(
        status_code=401,
        code="invalid_credentials",
        message="Invalid email or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )


class AuthService:
    def __init__(
        self,
        *,
        password_service: PasswordService,
        jwt_service: JwtService,
        rate_limiter: LoginRateLimiter,
        session_service: SessionService,
    ) -> None:
        self._password_service = password_service
        self._jwt_service = jwt_service
        self._rate_limiter = rate_limiter
        self._session_service = session_service

    async def login(
        self,
        session: AsyncSession,
        credentials: LoginRequest,
        *,
        client_ip: str,
    ) -> AuthResult:
        if credentials.student_id:
            identifier = normalize_student_id(credentials.student_id)
            user_query = User.student_id == identifier
        else:
            identifier = normalize_email(str(credentials.email))
            user_query = User.email == identifier

        rate_key = self._rate_limiter.key(client_ip, identifier)
        retry_after = await self._rate_limiter.consume(rate_key)
        if retry_after is not None:
            raise ApiError(
                status_code=429,
                code="too_many_login_attempts",
                message="Too many login attempts. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

        user = await session.scalar(select(User).where(user_query))
        password_matches = self._password_service.verify(
            credentials.password.get_secret_value(),
            user.password_hash if user else None,
        )

        if user is None or not password_matches or not user.is_active:
            raise invalid_credentials_error()

        if user.email_verified_at is None:
            raise ApiError(
                status_code=403,
                code="email_verification_required",
                message="Verify your university email before signing in.",
            )

        refresh_session = await self._session_service.create(session, user)
        token = self._jwt_service.issue_access_token(user.id)
        await self._rate_limiter.reset(rate_key)
        return AuthResult(
            response=LoginResponse(
                access_token=token.token,
                expires_in=token.expires_in,
                user=AuthenticatedUser(id=user.id, student_id=user.student_id, email=user.email),
            ),
            refresh_credential=refresh_session.credential,
            refresh_expires_at=refresh_session.expires_at,
        )

    async def refresh(
        self,
        session: AsyncSession,
        refresh_credential: str,
    ) -> AuthResult:
        refreshed = await self._session_service.refresh(
            session,
            refresh_credential,
        )
        access_token = self._jwt_service.issue_access_token(refreshed.user.id)
        return AuthResult(
            response=LoginResponse(
                access_token=access_token.token,
                expires_in=access_token.expires_in,
                user=AuthenticatedUser(
                    id=refreshed.user.id,
                    student_id=refreshed.user.student_id,
                    email=refreshed.user.email,
                ),
            ),
            refresh_credential=refreshed.credential,
            refresh_expires_at=refreshed.expires_at,
        )

    async def logout(
        self,
        session: AsyncSession,
        refresh_credential: str | None,
    ) -> None:
        if refresh_credential:
            await self._session_service.revoke(session, refresh_credential)
