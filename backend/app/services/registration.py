import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models.user import User
from app.services.email import EmailSender
from app.services.identity import normalize_email, normalize_student_id
from app.services.one_time_token import OneTimeTokenService
from app.services.password import PasswordPolicyError, PasswordService
from app.services.rate_limit import EmailVerificationRateLimiter


logger = logging.getLogger(__name__)

REGISTER_MESSAGE = "Account created. We sent a verification code to your university email."
VERIFY_MESSAGE = "Your university email is verified. You can now sign in."
RESEND_MESSAGE = "If the account is eligible, a new verification code will be sent."


@dataclass(frozen=True, slots=True)
class VerificationDelivery:
    recipient: str
    code: str
    expires_minutes: int


class RegistrationService:
    def __init__(
        self,
        *,
        password_service: PasswordService,
        token_service: OneTimeTokenService,
        email_sender: EmailSender,
        rate_limiter: EmailVerificationRateLimiter,
        allowed_domains: set[str],
        verification_expire_minutes: int,
    ) -> None:
        self._password_service = password_service
        self._token_service = token_service
        self._email_sender = email_sender
        self._rate_limiter = rate_limiter
        self._allowed_domains = allowed_domains
        self._verification_expire_minutes = verification_expire_minutes

    def _validate_student_email(self, email: str) -> str:
        normalized = normalize_email(email)
        domain = normalized.rsplit("@", 1)[-1] if "@" in normalized else ""
        if domain not in self._allowed_domains:
            raise ApiError(
                status_code=422,
                code="student_email_domain_not_allowed",
                message="Use an approved university email address.",
            )
        return normalized

    async def register(
        self,
        session: AsyncSession,
        *,
        student_id: str,
        email: str,
        password: str,
    ) -> tuple[User, VerificationDelivery]:
        normalized_student_id = normalize_student_id(student_id)
        normalized_email = self._validate_student_email(email)
        try:
            self._password_service.validate_new_password(password)
        except PasswordPolicyError as exc:
            raise ApiError(
                status_code=422,
                code="password_policy_failed",
                message=str(exc),
            ) from exc

        existing = await session.scalar(
            select(User).where(
                or_(
                    User.student_id == normalized_student_id,
                    User.email == normalized_email,
                )
            )
        )
        if existing is not None:
            raise ApiError(
                status_code=409,
                code="account_already_exists",
                message="An account with these student details already exists.",
            )

        user = User(
            student_id=normalized_student_id,
            email=normalized_email,
            password_hash=self._password_service.hash(password),
            email_verified_at=None,
            is_active=True,
        )
        session.add(user)
        try:
            await session.flush()
            issued = await self._token_service.issue_email_verification(
                session,
                user,
                commit=False,
            )
            await session.commit()
            await session.refresh(user)
        except IntegrityError as exc:
            await session.rollback()
            raise ApiError(
                status_code=409,
                code="account_already_exists",
                message="An account with these student details already exists.",
            ) from exc
        except Exception:
            await session.rollback()
            raise

        # Registration itself counts as the first verification delivery, so
        # callers cannot bypass the resend cooldown by immediately hitting the
        # resend endpoint after account creation.
        await self._rate_limiter.acquire_resend_cooldown(normalized_student_id)

        return user, VerificationDelivery(
            recipient=user.email,
            code=issued.credential,
            expires_minutes=self._verification_expire_minutes,
        )

    async def verify_email(
        self,
        session: AsyncSession,
        *,
        student_id: str,
        code: str,
        client_ip: str,
    ) -> None:
        normalized_student_id = normalize_student_id(student_id)
        retry_after = await self._rate_limiter.consume_attempt(
            client_ip=client_ip,
            student_id=normalized_student_id,
        )
        if retry_after is not None:
            raise ApiError(
                status_code=429,
                code="too_many_verification_attempts",
                message="Too many verification attempts. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

        user = await session.scalar(
            select(User)
            .where(User.student_id == normalized_student_id, User.is_active.is_(True))
            .with_for_update()
        )
        if user is None or user.email_verified_at is not None:
            await session.rollback()
            raise self._invalid_code_error()

        token = await self._token_service.lock_active_email_verification(
            session,
            user,
            code,
        )
        if token is None:
            # Preserve the durable failed-attempt counter (and possible token
            # invalidation) while still returning one generic verification error.
            await session.commit()
            raise self._invalid_code_error()

        verified_at = datetime.now(timezone.utc)
        try:
            user.email_verified_at = verified_at
            user.updated_at = verified_at
            await self._token_service.consume_email_verification(
                session,
                token,
                consumed_at=verified_at,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

        await self._rate_limiter.reset_attempts(
            client_ip=client_ip,
            student_id=normalized_student_id,
        )

    async def request_resend(
        self,
        session: AsyncSession,
        *,
        student_id: str,
    ) -> VerificationDelivery | None:
        normalized_student_id = normalize_student_id(student_id)
        if not await self._rate_limiter.acquire_resend_cooldown(normalized_student_id):
            return None

        user = await session.scalar(
            select(User).where(User.student_id == normalized_student_id)
        )
        if user is None or not user.is_active or user.email_verified_at is not None:
            return None

        issued = await self._token_service.issue_email_verification(session, user)
        return VerificationDelivery(
            recipient=user.email,
            code=issued.credential,
            expires_minutes=self._verification_expire_minutes,
        )

    async def deliver_verification_email(self, delivery: VerificationDelivery) -> None:
        try:
            await self._email_sender.send_email_verification(
                recipient=delivery.recipient,
                code=delivery.code,
                expires_minutes=delivery.expires_minutes,
            )
        except Exception:
            logger.exception("Verification email delivery failed")

    @staticmethod
    def _invalid_code_error() -> ApiError:
        return ApiError(
            status_code=400,
            code="invalid_verification_code",
            message="The verification code is invalid or has expired.",
        )
