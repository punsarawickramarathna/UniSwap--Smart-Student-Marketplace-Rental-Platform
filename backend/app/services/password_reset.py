import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models.user import User
from app.services.email import EmailSender
from app.services.identity import normalize_email
from app.services.one_time_token import OneTimeTokenService
from app.services.password import PasswordPolicyError, PasswordService
from app.services.rate_limit import PasswordResetRateLimiter
from app.services.session import SessionService


logger = logging.getLogger(__name__)


FORGOT_PASSWORD_MESSAGE = (
    "If an eligible account exists for that email, password reset instructions "
    "will be sent shortly."
)
RESET_PASSWORD_MESSAGE = "Your password has been reset. Sign in with your new password."


@dataclass(frozen=True, slots=True)
class PasswordResetDelivery:
    recipient: str
    reset_url: str
    expires_minutes: int


def invalid_reset_token_error() -> ApiError:
    # One public error is shared by unknown, expired, invalidated and consumed
    # credentials so the endpoint never exposes whether a token maps to a user.
    return ApiError(
        status_code=400,
        code="invalid_password_reset_token",
        message="This password reset link is invalid or has expired.",
    )


class PasswordResetService:
    def __init__(
        self,
        *,
        token_service: OneTimeTokenService,
        email_sender: EmailSender,
        rate_limiter: PasswordResetRateLimiter,
        frontend_base_url: str,
        token_expire_minutes: int,
        password_service: PasswordService,
        session_service: SessionService,
    ) -> None:
        self._token_service = token_service
        self._email_sender = email_sender
        self._rate_limiter = rate_limiter
        self._frontend_base_url = frontend_base_url.rstrip("/")
        self._token_expire_minutes = token_expire_minutes
        self._password_service = password_service
        self._session_service = session_service

    async def request_reset(
        self,
        session: AsyncSession,
        email: str,
        *,
        client_ip: str,
    ) -> PasswordResetDelivery | None:
        normalized_email = normalize_email(email)
        await self._rate_limiter.check_ip(client_ip)

        # Cooldown is consumed for every syntactically valid normalized email,
        # including unknown/disabled accounts, so the public behavior does not
        # disclose account existence.
        if not await self._rate_limiter.acquire_email_cooldown(normalized_email):
            return None

        user = await session.scalar(select(User).where(User.email == normalized_email))
        if user is None or not user.is_active:
            return None

        issued = await self._token_service.issue_password_reset(session, user)
        return PasswordResetDelivery(
            recipient=user.email,
            reset_url=self._build_reset_url(issued.credential),
            expires_minutes=self._token_expire_minutes,
        )

    async def reset_password(
        self,
        session: AsyncSession,
        *,
        credential: str,
        new_password: str,
    ) -> None:
        try:
            self._password_service.validate_new_password(new_password)
        except PasswordPolicyError as exc:
            raise ApiError(
                status_code=422,
                code="password_policy_failed",
                message=str(exc),
            ) from exc

        token = await self._token_service.lock_active_password_reset(
            session,
            credential,
        )
        if token is None:
            await session.rollback()
            raise invalid_reset_token_error()

        user = await session.scalar(
            select(User)
            .where(User.id == token.user_id, User.is_active.is_(True))
            .with_for_update()
        )
        if user is None:
            await session.rollback()
            raise invalid_reset_token_error()

        # Requiring a genuinely new password makes the credential-recovery
        # contract explicit: the old password must stop authenticating.
        if self._password_service.verify(new_password, user.password_hash):
            await session.rollback()
            raise ApiError(
                status_code=422,
                code="password_reuse_not_allowed",
                message="Choose a password different from your current password.",
            )

        changed_at = datetime.now(timezone.utc)
        try:
            new_hash = self._password_service.hash(new_password)
            user.password_hash = new_hash
            user.updated_at = changed_at
            await self._token_service.consume_password_reset(
                session,
                token,
                consumed_at=changed_at,
            )
            await self._session_service.revoke_all_for_user(
                session,
                user.id,
                revoked_at=changed_at,
            )
            # Password update, reset-token consumption, sibling-token
            # invalidation and refresh-session revocation succeed or fail as one
            # transaction. A revocation/database failure cannot leave a partial
            # credential reset behind.
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    async def deliver_reset_email(self, delivery: PasswordResetDelivery) -> None:
        try:
            await self._email_sender.send_password_reset(
                recipient=delivery.recipient,
                reset_url=delivery.reset_url,
                expires_minutes=delivery.expires_minutes,
            )
        except Exception:
            # Token persistence is already committed and the HTTP response must
            # not expose email-provider state. Never log the raw reset URL/token.
            logger.exception("Password reset email delivery failed")

    def _build_reset_url(self, credential: str) -> str:
        query = urlencode({"token": credential})
        return f"{self._frontend_base_url}/reset-password?{query}"
