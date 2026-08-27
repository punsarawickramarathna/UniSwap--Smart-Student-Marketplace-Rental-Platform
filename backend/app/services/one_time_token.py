import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth_one_time_token import (
    AuthOneTimeToken,
    EMAIL_VERIFICATION_PURPOSE,
    PASSWORD_RESET_PURPOSE,
)
from app.models.user import User


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def hash_one_time_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_verification_code(*, user_id: object, code: str, pepper: bytes) -> str:
    # Six-digit codes have a deliberately small input space. A keyed HMAC
    # prevents an attacker with only a database dump from brute-forcing all
    # 1,000,000 values offline.
    message = f"{user_id}:{code}".encode("utf-8")
    return hmac.new(pepper, message, hashlib.sha256).hexdigest()


@dataclass(frozen=True, slots=True)
class IssuedOneTimeToken:
    credential: str
    expires_at: datetime


class OneTimeTokenService:
    def __init__(
        self,
        *,
        password_reset_expire_minutes: int,
        email_verification_expire_minutes: int = 10,
        verification_pepper: str = "development-only-verification-pepper",
        verification_max_attempts: int = 6,
    ) -> None:
        self._password_reset_expire_minutes = password_reset_expire_minutes
        self._email_verification_expire_minutes = email_verification_expire_minutes
        self._verification_pepper = verification_pepper.encode("utf-8")
        self._verification_max_attempts = verification_max_attempts

    async def issue_password_reset(
        self,
        session: AsyncSession,
        user: User,
        *,
        now: datetime | None = None,
    ) -> IssuedOneTimeToken:
        issued_at = now or utc_now()
        expires_at = issued_at + timedelta(
            minutes=self._password_reset_expire_minutes
        )

        await session.execute(
            update(AuthOneTimeToken)
            .where(
                AuthOneTimeToken.user_id == user.id,
                AuthOneTimeToken.purpose == PASSWORD_RESET_PURPOSE,
                AuthOneTimeToken.consumed_at.is_(None),
                AuthOneTimeToken.invalidated_at.is_(None),
            )
            .values(invalidated_at=issued_at)
        )

        credential = secrets.token_urlsafe(48)
        session.add(
            AuthOneTimeToken(
                user_id=user.id,
                purpose=PASSWORD_RESET_PURPOSE,
                token_hash=hash_one_time_token(credential),
                expires_at=expires_at,
                created_at=issued_at,
            )
        )
        await session.commit()
        return IssuedOneTimeToken(
            credential=credential,
            expires_at=expires_at,
        )

    async def issue_email_verification(
        self,
        session: AsyncSession,
        user: User,
        *,
        now: datetime | None = None,
        commit: bool = True,
    ) -> IssuedOneTimeToken:
        issued_at = now or utc_now()
        expires_at = issued_at + timedelta(
            minutes=self._email_verification_expire_minutes
        )

        await session.execute(
            update(AuthOneTimeToken)
            .where(
                AuthOneTimeToken.user_id == user.id,
                AuthOneTimeToken.purpose == EMAIL_VERIFICATION_PURPOSE,
                AuthOneTimeToken.consumed_at.is_(None),
                AuthOneTimeToken.invalidated_at.is_(None),
            )
            .values(invalidated_at=issued_at)
        )

        code = f"{secrets.randbelow(1_000_000):06d}"
        session.add(
            AuthOneTimeToken(
                user_id=user.id,
                purpose=EMAIL_VERIFICATION_PURPOSE,
                token_hash=hash_verification_code(
                    user_id=user.id,
                    code=code,
                    pepper=self._verification_pepper,
                ),
                expires_at=expires_at,
                created_at=issued_at,
            )
        )
        if commit:
            await session.commit()
        return IssuedOneTimeToken(credential=code, expires_at=expires_at)

    async def lock_active_email_verification(
        self,
        session: AsyncSession,
        user: User,
        code: str,
        *,
        now: datetime | None = None,
    ) -> AuthOneTimeToken | None:
        checked_at = now or utc_now()
        token = await session.scalar(
            select(AuthOneTimeToken)
            .where(
                AuthOneTimeToken.user_id == user.id,
                AuthOneTimeToken.purpose == EMAIL_VERIFICATION_PURPOSE,
                AuthOneTimeToken.consumed_at.is_(None),
                AuthOneTimeToken.invalidated_at.is_(None),
            )
            .order_by(AuthOneTimeToken.created_at.desc())
            .with_for_update()
        )
        if token is None or as_utc(token.expires_at) <= checked_at:
            return None

        if token.attempt_count >= self._verification_max_attempts:
            token.invalidated_at = checked_at
            return None

        candidate_hash = hash_verification_code(
            user_id=user.id,
            code=code,
            pepper=self._verification_pepper,
        )
        if not hmac.compare_digest(token.token_hash, candidate_hash):
            token.attempt_count += 1
            if token.attempt_count >= self._verification_max_attempts:
                token.invalidated_at = checked_at
            return None

        return token

    async def consume_email_verification(
        self,
        session: AsyncSession,
        token: AuthOneTimeToken,
        *,
        consumed_at: datetime,
    ) -> None:
        token.consumed_at = consumed_at
        await session.execute(
            update(AuthOneTimeToken)
            .where(
                AuthOneTimeToken.user_id == token.user_id,
                AuthOneTimeToken.purpose == EMAIL_VERIFICATION_PURPOSE,
                AuthOneTimeToken.id != token.id,
                AuthOneTimeToken.consumed_at.is_(None),
                AuthOneTimeToken.invalidated_at.is_(None),
            )
            .values(invalidated_at=consumed_at)
        )

    async def lock_active_password_reset(
        self,
        session: AsyncSession,
        credential: str,
        *,
        now: datetime | None = None,
    ) -> AuthOneTimeToken | None:
        checked_at = now or utc_now()
        token = await session.scalar(
            select(AuthOneTimeToken)
            .where(
                AuthOneTimeToken.token_hash == hash_one_time_token(credential),
                AuthOneTimeToken.purpose == PASSWORD_RESET_PURPOSE,
                AuthOneTimeToken.consumed_at.is_(None),
                AuthOneTimeToken.invalidated_at.is_(None),
            )
            .with_for_update()
        )
        if token is None or as_utc(token.expires_at) <= checked_at:
            return None
        return token

    async def consume_password_reset(
        self,
        session: AsyncSession,
        token: AuthOneTimeToken,
        *,
        consumed_at: datetime,
    ) -> None:
        token.consumed_at = consumed_at
        await session.execute(
            update(AuthOneTimeToken)
            .where(
                AuthOneTimeToken.user_id == token.user_id,
                AuthOneTimeToken.purpose == PASSWORD_RESET_PURPOSE,
                AuthOneTimeToken.id != token.id,
                AuthOneTimeToken.consumed_at.is_(None),
                AuthOneTimeToken.invalidated_at.is_(None),
            )
            .values(invalidated_at=consumed_at)
        )
