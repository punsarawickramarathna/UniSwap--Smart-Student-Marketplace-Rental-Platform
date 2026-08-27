import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models.auth_session import AuthSession
from app.models.user import User


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def invalid_refresh_session_error() -> ApiError:
    return ApiError(
        status_code=401,
        code="invalid_refresh_session",
        message="The session is no longer valid. Please sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )


@dataclass(frozen=True, slots=True)
class CreatedRefreshSession:
    credential: str
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class RefreshedSession:
    user: User
    credential: str | None
    expires_at: datetime


class SessionService:
    def __init__(
        self,
        *,
        expires_days: int,
        rotation_grace_seconds: int,
    ) -> None:
        self._expires_days = expires_days
        self._rotation_grace = timedelta(seconds=rotation_grace_seconds)

    async def create(
        self,
        session: AsyncSession,
        user: User,
    ) -> CreatedRefreshSession:
        now = utc_now()
        credential = secrets.token_urlsafe(48)
        expires_at = now + timedelta(days=self._expires_days)
        session.add(
            AuthSession(
                user_id=user.id,
                family_id=uuid.uuid4(),
                token_hash=hash_refresh_token(credential),
                expires_at=expires_at,
                created_at=now,
            )
        )
        await session.commit()
        return CreatedRefreshSession(
            credential=credential,
            expires_at=expires_at,
        )

    async def refresh(
        self,
        session: AsyncSession,
        credential: str,
    ) -> RefreshedSession:
        now = utc_now()
        auth_session = await session.scalar(
            select(AuthSession)
            .where(AuthSession.token_hash == hash_refresh_token(credential))
            .with_for_update()
        )
        if auth_session is None:
            raise invalid_refresh_session_error()

        expires_at = as_utc(auth_session.expires_at)
        if expires_at <= now:
            await self._revoke_family(session, auth_session.family_id, now)
            await session.commit()
            raise invalid_refresh_session_error()

        user = await session.get(User, auth_session.user_id)
        if user is None or not user.is_active or user.email_verified_at is None:
            await self._revoke_family(session, auth_session.family_id, now)
            await session.commit()
            raise invalid_refresh_session_error()

        if auth_session.revoked_at is not None:
            return await self._handle_rotated_credential(
                session,
                auth_session,
                user,
                now,
                expires_at,
            )

        next_credential = secrets.token_urlsafe(48)
        next_session = AuthSession(
            id=uuid.uuid4(),
            user_id=auth_session.user_id,
            family_id=auth_session.family_id,
            token_hash=hash_refresh_token(next_credential),
            expires_at=expires_at,
            created_at=now,
        )
        session.add(next_session)
        await session.flush()
        auth_session.revoked_at = now
        auth_session.replaced_by_session_id = next_session.id
        auth_session.last_used_at = now
        await session.commit()

        return RefreshedSession(
            user=user,
            credential=next_credential,
            expires_at=expires_at,
        )

    async def revoke(
        self,
        session: AsyncSession,
        credential: str,
    ) -> None:
        auth_session = await session.scalar(
            select(AuthSession)
            .where(AuthSession.token_hash == hash_refresh_token(credential))
            .with_for_update()
        )
        if auth_session is None:
            return

        await self._revoke_family(session, auth_session.family_id, utc_now())
        await session.commit()

    async def revoke_all_for_user(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        *,
        revoked_at: datetime | None = None,
    ) -> None:
        """Stage revocation of every active refresh session for a user.

        This method intentionally does not commit. Credential-recovery flows can
        update the password, consume the reset token and revoke sessions in one
        database transaction so partial password resets cannot occur.
        """
        await session.execute(
            update(AuthSession)
            .where(
                AuthSession.user_id == user_id,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=revoked_at or utc_now())
        )

    async def _handle_rotated_credential(
        self,
        session: AsyncSession,
        auth_session: AuthSession,
        user: User,
        now: datetime,
        expires_at: datetime,
    ) -> RefreshedSession:
        revoked_at = as_utc(auth_session.revoked_at)  # type: ignore[arg-type]
        active_successor = await session.scalar(
            select(AuthSession.id).where(
                AuthSession.family_id == auth_session.family_id,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > now,
            )
        )
        if (
            auth_session.replaced_by_session_id is not None
            and now <= revoked_at + self._rotation_grace
            and active_successor is not None
        ):
            return RefreshedSession(
                user=user,
                credential=None,
                expires_at=expires_at,
            )

        if auth_session.replaced_by_session_id is not None:
            auth_session.reuse_detected_at = now
            await self._revoke_family(session, auth_session.family_id, now)
            await session.commit()

        raise invalid_refresh_session_error()

    async def _revoke_family(
        self,
        session: AsyncSession,
        family_id: uuid.UUID,
        revoked_at: datetime,
    ) -> None:
        await session.execute(
            update(AuthSession)
            .where(
                AuthSession.family_id == family_id,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=revoked_at)
        )
