from datetime import datetime, timedelta, timezone

import pytest
from httpx import Response
from pydantic import ValidationError
from sqlalchemy import func, select, update

from app.config import Settings
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.session import hash_refresh_token


PASSWORD = "Strong-password-123"
COOKIE_NAME = "uniswap_refresh"
CSRF_HEADERS = {"X-CSRF-Protection": "1"}


async def add_user(app_context) -> User:
    app, session_factory = app_context
    user = User(
        email="student@campus.edu",
        password_hash=app.state.password_service.hash(PASSWORD),
        email_verified_at=datetime.now(timezone.utc),
        is_active=True,
    )
    async with session_factory() as session:
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user


async def login(client, app_context) -> tuple[User, str, Response]:
    user = await add_user(app_context)
    response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": PASSWORD},
    )
    assert response.status_code == 200
    return user, response.cookies[COOKIE_NAME], response


def use_refresh_cookie(client, credential: str) -> None:
    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, credential, path="/api/auth")


def assert_invalid_session(response) -> None:
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_refresh_session"


def test_production_rejects_insecure_refresh_cookie():
    with pytest.raises(ValidationError, match="Production refresh cookies must be Secure"):
        Settings(
            app_env="production",
            database_url="postgresql+asyncpg://postgres:password@db.example.com/db",
            jwt_secret_key="test-secret-key-that-is-at-least-32-characters",
            refresh_cookie_secure=False,
        )


@pytest.mark.asyncio
async def test_login_persists_only_hash_and_sets_protected_cookie(client, app_context):
    _, credential, response = await login(client, app_context)
    _, session_factory = app_context

    async with session_factory() as session:
        auth_session = await session.scalar(select(AuthSession))

    assert auth_session is not None
    assert auth_session.token_hash == hash_refresh_token(credential)
    assert credential not in auth_session.token_hash
    assert len(auth_session.token_hash) == 64

    cookie = client.cookies.get(COOKIE_NAME)
    assert cookie == credential
    set_cookie = response.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "path=/api/auth" in set_cookie


@pytest.mark.asyncio
async def test_refresh_rotates_session_and_returns_new_access(client, app_context):
    user, old_credential, _ = await login(client, app_context)

    response = await client.post("/api/auth/refresh", headers=CSRF_HEADERS)

    assert response.status_code == 200
    assert response.json()["user"] == {
        "id": str(user.id),
        "email": user.email,
    }
    new_credential = response.cookies[COOKIE_NAME]
    assert new_credential != old_credential

    _, session_factory = app_context
    async with session_factory() as session:
        records = list(
            await session.scalars(
                select(AuthSession).order_by(AuthSession.created_at)
            )
        )
    assert len(records) == 2
    assert records[0].revoked_at is not None
    assert records[0].replaced_by_session_id == records[1].id
    assert records[1].revoked_at is None
    assert records[1].expires_at == records[0].expires_at


@pytest.mark.asyncio
async def test_recent_rotated_token_handles_refresh_race_without_rotating_again(
    client, app_context
):
    _, old_credential, _ = await login(client, app_context)
    first_refresh = await client.post("/api/auth/refresh", headers=CSRF_HEADERS)
    assert first_refresh.status_code == 200

    use_refresh_cookie(client, old_credential)
    raced_refresh = await client.post("/api/auth/refresh", headers=CSRF_HEADERS)

    assert raced_refresh.status_code == 200
    assert COOKIE_NAME not in raced_refresh.cookies
    _, session_factory = app_context
    async with session_factory() as session:
        count = await session.scalar(select(func.count()).select_from(AuthSession))
    assert count == 2


@pytest.mark.asyncio
async def test_reuse_after_rotation_grace_revokes_successor(client, app_context):
    _, old_credential, _ = await login(client, app_context)
    first_refresh = await client.post("/api/auth/refresh", headers=CSRF_HEADERS)
    new_credential = first_refresh.cookies[COOKIE_NAME]
    _, session_factory = app_context
    old_hash = hash_refresh_token(old_credential)
    outside_grace = datetime.now(timezone.utc) - timedelta(seconds=11)
    async with session_factory() as session:
        await session.execute(
            update(AuthSession)
            .where(AuthSession.token_hash == old_hash)
            .values(revoked_at=outside_grace)
        )
        await session.commit()

    use_refresh_cookie(client, old_credential)
    replay = await client.post("/api/auth/refresh", headers=CSRF_HEADERS)
    assert_invalid_session(replay)

    use_refresh_cookie(client, new_credential)
    successor = await client.post("/api/auth/refresh", headers=CSRF_HEADERS)
    assert_invalid_session(successor)


@pytest.mark.asyncio
async def test_expired_session_cannot_refresh(client, app_context):
    _, credential, _ = await login(client, app_context)
    _, session_factory = app_context
    now = datetime.now(timezone.utc)
    async with session_factory() as session:
        await session.execute(
            update(AuthSession)
            .where(AuthSession.token_hash == hash_refresh_token(credential))
            .values(
                created_at=now - timedelta(days=2),
                expires_at=now - timedelta(days=1),
            )
        )
        await session.commit()

    response = await client.post("/api/auth/refresh", headers=CSRF_HEADERS)

    assert_invalid_session(response)


@pytest.mark.asyncio
async def test_logout_revokes_session_and_clears_cookie(client, app_context):
    _, credential, _ = await login(client, app_context)

    logout_response = await client.post("/api/auth/logout", headers=CSRF_HEADERS)

    assert logout_response.status_code == 204
    cookie = logout_response.headers["set-cookie"]
    assert "Max-Age=0" in cookie
    assert "Path=/api/auth" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie

    # Re-attaching the stolen/old credential proves server-side revocation, not
    # merely browser cookie deletion. It must never mint another access token.
    use_refresh_cookie(client, credential)
    refresh_response = await client.post("/api/auth/refresh", headers=CSRF_HEADERS)
    assert_invalid_session(refresh_response)


@pytest.mark.asyncio
async def test_logout_does_not_claim_to_instantly_revoke_existing_access_jwt(
    client, app_context
):
    _, credential, login_response = await login(client, app_context)
    access_token = login_response.json()["access_token"]

    logout_response = await client.post("/api/auth/logout", headers=CSRF_HEADERS)
    assert logout_response.status_code == 204

    # Access JWTs are intentionally stateless and short-lived. With no denylist
    # in this repository, a token already issued remains valid until its exp.
    me_response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_response.status_code == 200

    # The revoked browser session, however, can no longer mint a replacement.
    use_refresh_cookie(client, credential)
    refresh_response = await client.post("/api/auth/refresh", headers=CSRF_HEADERS)
    assert_invalid_session(refresh_response)


@pytest.mark.asyncio
async def test_logout_is_idempotent_for_missing_and_already_revoked_session(
    client, app_context
):
    _, credential, _ = await login(client, app_context)

    first_logout = await client.post("/api/auth/logout", headers=CSRF_HEADERS)
    assert first_logout.status_code == 204

    # Simulate a repeated request carrying the same already-revoked credential.
    use_refresh_cookie(client, credential)
    repeated_logout = await client.post("/api/auth/logout", headers=CSRF_HEADERS)
    assert repeated_logout.status_code == 204
    assert "Max-Age=0" in repeated_logout.headers["set-cookie"]

    # A caller with no cookie can also safely repeat logout.
    client.cookies.clear()
    no_session_logout = await client.post("/api/auth/logout", headers=CSRF_HEADERS)
    assert no_session_logout.status_code == 204
    assert "Max-Age=0" in no_session_logout.headers["set-cookie"]


@pytest.mark.asyncio
async def test_logout_accepts_an_already_expired_refresh_session(client, app_context):
    _, credential, _ = await login(client, app_context)
    _, session_factory = app_context
    expired_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    created_at = datetime.now(timezone.utc) - timedelta(minutes=10)

    async with session_factory() as session:
        await session.execute(
            update(AuthSession)
            .where(AuthSession.token_hash == hash_refresh_token(credential))
            .values(
                created_at=created_at,
                expires_at=expired_at,
            )
        )
        await session.commit()

    logout_response = await client.post("/api/auth/logout", headers=CSRF_HEADERS)
    assert logout_response.status_code == 204

    use_refresh_cookie(client, credential)
    refresh_response = await client.post("/api/auth/refresh", headers=CSRF_HEADERS)
    assert_invalid_session(refresh_response)


@pytest.mark.asyncio
async def test_refresh_requires_cookie_and_csrf_header(client, app_context):
    await login(client, app_context)

    missing_header = await client.post("/api/auth/refresh")
    assert missing_header.status_code == 403
    assert missing_header.json()["error"]["code"] == "csrf_protection_required"

    client.cookies.clear()
    missing_cookie = await client.post(
        "/api/auth/refresh",
        headers=CSRF_HEADERS,
    )
    assert_invalid_session(missing_cookie)


@pytest.mark.asyncio
async def test_credentialed_cors_preflight_uses_explicit_frontend_origin(client):
    response = await client.options(
        "/api/auth/refresh",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-CSRF-Protection",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"
