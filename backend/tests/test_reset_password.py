from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select, update

from app.models.auth_one_time_token import (
    AuthOneTimeToken,
    EMAIL_VERIFICATION_PURPOSE,
    PASSWORD_RESET_PURPOSE,
)
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.one_time_token import hash_one_time_token
from app.services.password_reset import RESET_PASSWORD_MESSAGE
from app.services.session import hash_refresh_token


OLD_PASSWORD = "Strong-password-123"
NEW_PASSWORD = "New-strong-password-456"
COOKIE_NAME = "uniswap_refresh"
CSRF_HEADERS = {"X-CSRF-Protection": "1"}
INVALID_RESET_RESPONSE = {
    "error": {
        "code": "invalid_password_reset_token",
        "message": "This password reset link is invalid or has expired.",
    }
}


async def add_user(app_context, *, email: str = "student@campus.edu") -> User:
    app, session_factory = app_context
    user = User(
        email=email,
        password_hash=app.state.password_service.hash(OLD_PASSWORD),
        email_verified_at=datetime.now(timezone.utc),
        is_active=True,
    )
    async with session_factory() as session:
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user


async def issue_reset_token(client, app_context, email: str) -> str:
    app, _ = app_context
    response = await client.post(
        "/api/auth/forgot-password",
        json={"email": email},
    )
    assert response.status_code == 202
    message = app.state.email_sender.password_reset_messages[-1]
    return parse_qs(urlparse(str(message["reset_url"])).query)["token"][0]


async def login(client, email: str, password: str):
    return await client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )


def use_refresh_cookie(client, credential: str) -> None:
    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, credential, path="/api/auth")


def assert_invalid_refresh(response) -> None:
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_refresh_session"


@pytest.mark.asyncio
async def test_valid_reset_changes_password_once_and_revokes_all_refresh_sessions(
    client, app_context
):
    app, session_factory = app_context
    user = await add_user(app_context)

    first_login = await login(client, user.email, OLD_PASSWORD)
    assert first_login.status_code == 200
    refresh_one = first_login.cookies[COOKIE_NAME]
    old_access_token = first_login.json()["access_token"]

    second_login = await login(client, user.email, OLD_PASSWORD)
    assert second_login.status_code == 200
    refresh_two = second_login.cookies[COOKIE_NAME]
    assert refresh_two != refresh_one

    raw_reset_token = await issue_reset_token(client, app_context, user.email)

    response = await client.post(
        "/api/auth/reset-password",
        json={"token": raw_reset_token, "new_password": NEW_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json() == {"message": RESET_PASSWORD_MESSAGE}
    set_cookie = response.headers["set-cookie"]
    assert "Max-Age=0" in set_cookie
    assert "Path=/api/auth" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie

    async with session_factory() as session:
        stored_user = await session.get(User, user.id)
        reset_token = await session.scalar(
            select(AuthOneTimeToken).where(
                AuthOneTimeToken.token_hash == hash_one_time_token(raw_reset_token)
            )
        )
        sessions = list(
            await session.scalars(
                select(AuthSession).where(AuthSession.user_id == user.id)
            )
        )

    assert stored_user is not None
    assert app.state.password_service.verify(NEW_PASSWORD, stored_user.password_hash)
    assert not app.state.password_service.verify(OLD_PASSWORD, stored_user.password_hash)
    assert reset_token is not None and reset_token.consumed_at is not None
    assert len(sessions) == 2
    assert all(record.revoked_at is not None for record in sessions)

    # Both independent browser/device refresh sessions existed before recovery;
    # neither can survive a successful password reset.
    use_refresh_cookie(client, refresh_one)
    assert_invalid_refresh(
        await client.post("/api/auth/refresh", headers=CSRF_HEADERS)
    )
    use_refresh_cookie(client, refresh_two)
    assert_invalid_refresh(
        await client.post("/api/auth/refresh", headers=CSRF_HEADERS)
    )

    # Access JWTs remain stateless in this repository. Recovery revokes every
    # long-lived refresh session, while an already-issued access token can
    # remain valid only until its short configured expiry.
    old_access = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {old_access_token}"},
    )
    assert old_access.status_code == 200

    client.cookies.clear()
    old_login = await login(client, user.email, OLD_PASSWORD)
    assert old_login.status_code == 401
    assert old_login.json()["error"]["code"] == "invalid_credentials"

    new_login = await login(client, user.email, NEW_PASSWORD)
    assert new_login.status_code == 200

    # The reset credential is strictly single-use/idempotent on retry.
    reused = await client.post(
        "/api/auth/reset-password",
        json={"token": raw_reset_token, "new_password": "Another-password-789"},
    )
    assert reused.status_code == 400
    assert reused.json() == INVALID_RESET_RESPONSE


@pytest.mark.asyncio
async def test_invalid_expired_used_and_wrong_purpose_tokens_share_generic_failure(
    client, app_context
):
    app, session_factory = app_context
    user = await add_user(app_context, email="generic@campus.edu")
    original_hash = user.password_hash

    invalid = await client.post(
        "/api/auth/reset-password",
        json={"token": "not-a-real-reset-token", "new_password": NEW_PASSWORD},
    )
    assert invalid.status_code == 400
    assert invalid.json() == INVALID_RESET_RESPONSE

    expired_token = await issue_reset_token(client, app_context, user.email)
    async with session_factory() as session:
        await session.execute(
            update(AuthOneTimeToken)
            .where(AuthOneTimeToken.token_hash == hash_one_time_token(expired_token))
            .values(
                created_at=datetime.now(timezone.utc) - timedelta(hours=2),
                expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
            )
        )
        await session.commit()

    expired = await client.post(
        "/api/auth/reset-password",
        json={"token": expired_token, "new_password": NEW_PASSWORD},
    )
    assert expired.status_code == 400
    assert expired.json() == INVALID_RESET_RESPONSE

    verification_credential = "verification-purpose-token-that-is-not-a-reset-token"
    now = datetime.now(timezone.utc)
    async with session_factory() as session:
        session.add(
            AuthOneTimeToken(
                user_id=user.id,
                purpose=EMAIL_VERIFICATION_PURPOSE,
                token_hash=hash_one_time_token(verification_credential),
                expires_at=now + timedelta(minutes=30),
                created_at=now,
            )
        )
        await session.commit()

    wrong_purpose = await client.post(
        "/api/auth/reset-password",
        json={"token": verification_credential, "new_password": NEW_PASSWORD},
    )
    assert wrong_purpose.status_code == 400
    assert wrong_purpose.json() == INVALID_RESET_RESPONSE

    async with session_factory() as session:
        stored_user = await session.get(User, user.id)
    assert stored_user is not None
    assert stored_user.password_hash == original_hash
    assert app.state.password_service.verify(OLD_PASSWORD, stored_user.password_hash)


@pytest.mark.asyncio
async def test_password_policy_and_reuse_reject_without_consuming_token(
    client, app_context
):
    _, session_factory = app_context
    user = await add_user(app_context, email="policy@campus.edu")
    raw_token = await issue_reset_token(client, app_context, user.email)

    too_short = await client.post(
        "/api/auth/reset-password",
        json={"token": raw_token, "new_password": "short"},
    )
    assert too_short.status_code == 422
    assert too_short.json()["error"]["code"] == "password_policy_failed"

    same_password = await client.post(
        "/api/auth/reset-password",
        json={"token": raw_token, "new_password": OLD_PASSWORD},
    )
    assert same_password.status_code == 422
    assert same_password.json()["error"]["code"] == "password_reuse_not_allowed"

    async with session_factory() as session:
        token = await session.scalar(
            select(AuthOneTimeToken).where(
                AuthOneTimeToken.token_hash == hash_one_time_token(raw_token)
            )
        )
    assert token is not None
    assert token.consumed_at is None
    assert token.invalidated_at is None


@pytest.mark.asyncio
async def test_session_revocation_failure_rolls_back_password_and_token(
    client, app_context, monkeypatch
):
    app, session_factory = app_context
    user = await add_user(app_context, email="rollback@campus.edu")
    login_response = await login(client, user.email, OLD_PASSWORD)
    assert login_response.status_code == 200
    refresh_credential = login_response.cookies[COOKIE_NAME]
    raw_token = await issue_reset_token(client, app_context, user.email)

    async def fail_revocation(*_args, **_kwargs):
        raise RuntimeError("simulated session revocation failure")

    monkeypatch.setattr(
        app.state.session_service,
        "revoke_all_for_user",
        fail_revocation,
    )

    with pytest.raises(RuntimeError, match="simulated session revocation failure"):
        await client.post(
            "/api/auth/reset-password",
            json={"token": raw_token, "new_password": NEW_PASSWORD},
        )

    async with session_factory() as session:
        stored_user = await session.get(User, user.id)
        reset_token = await session.scalar(
            select(AuthOneTimeToken).where(
                AuthOneTimeToken.token_hash == hash_one_time_token(raw_token)
            )
        )
        auth_session = await session.scalar(
            select(AuthSession).where(
                AuthSession.token_hash == hash_refresh_token(refresh_credential)
            )
        )

    assert stored_user is not None
    assert app.state.password_service.verify(OLD_PASSWORD, stored_user.password_hash)
    assert not app.state.password_service.verify(NEW_PASSWORD, stored_user.password_hash)
    assert reset_token is not None and reset_token.consumed_at is None
    assert auth_session is not None and auth_session.revoked_at is None
