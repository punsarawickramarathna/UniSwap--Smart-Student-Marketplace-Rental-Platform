from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, update

from app.models.user import User
from app.services.jwt import JwtService


PASSWORD = "Strong-password-123"
AUTH_ERROR = {
    "error": {
        "code": "invalid_access_token",
        "message": "A valid Bearer access token is required.",
    }
}


async def add_user(
    app_context,
    *,
    email: str = "student@campus.edu",
    verified: bool = True,
    active: bool = True,
) -> User:
    app, session_factory = app_context
    user = User(
        email=email,
        password_hash=app.state.password_service.hash(PASSWORD),
        email_verified_at=datetime.now(timezone.utc) if verified else None,
        is_active=active,
    )
    async with session_factory() as session:
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user


def authorization(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def assert_unauthorized(response) -> None:
    assert response.status_code == 401
    assert response.json() == AUTH_ERROR
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.asyncio
async def test_valid_access_token_returns_current_safe_user(client, app_context):
    user = await add_user(app_context)
    token = app_context[0].state.jwt_service.issue_access_token(user.id).token

    response = await client.get("/api/auth/me", headers=authorization(token))

    assert response.status_code == 200
    assert response.json() == {"id": str(user.id), "email": user.email}
    assert "password" not in response.text.lower()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Basic credentials"},
        {"Authorization": "Bearer not-a-jwt"},
    ],
    ids=["missing", "wrong-scheme", "malformed"],
)
async def test_invalid_authorization_header_is_rejected(client, headers):
    response = await client.get("/api/auth/me", headers=headers)

    assert_unauthorized(response)


@pytest.mark.asyncio
async def test_expired_access_token_is_rejected(client, app_context):
    user = await add_user(app_context)
    expired_at = datetime.now(timezone.utc) - timedelta(minutes=16)
    token = app_context[0].state.jwt_service.issue_access_token(
        user.id, now=expired_at
    ).token

    response = await client.get("/api/auth/me", headers=authorization(token))

    assert_unauthorized(response)


@pytest.mark.asyncio
async def test_token_with_tampered_signature_is_rejected(client, app_context):
    user = await add_user(app_context)
    untrusted_service = JwtService(
        secret_key="different-test-secret-that-is-at-least-32-characters",
        algorithm="HS256",
        issuer="uniswap-api",
        audience="uniswap-web",
        expires_minutes=15,
    )
    token = untrusted_service.issue_access_token(user.id).token

    response = await client.get("/api/auth/me", headers=authorization(token))

    assert_unauthorized(response)


@pytest.mark.asyncio
async def test_deleted_user_is_rejected_after_token_issuance(
    client, app_context
):
    user = await add_user(app_context)
    app, session_factory = app_context
    token = app.state.jwt_service.issue_access_token(user.id).token
    async with session_factory() as session:
        await session.execute(delete(User).where(User.id == user.id))
        await session.commit()

    response = await client.get("/api/auth/me", headers=authorization(token))

    assert_unauthorized(response)


@pytest.mark.asyncio
async def test_disabled_user_is_rejected_after_token_issuance(
    client, app_context
):
    user = await add_user(app_context)
    app, session_factory = app_context
    token = app.state.jwt_service.issue_access_token(user.id).token
    async with session_factory() as session:
        await session.execute(
            update(User).where(User.id == user.id).values(is_active=False)
        )
        await session.commit()

    response = await client.get("/api/auth/me", headers=authorization(token))

    assert_unauthorized(response)


@pytest.mark.asyncio
async def test_unverified_user_is_rejected_even_with_signed_token(
    client, app_context
):
    user = await add_user(app_context, verified=False)
    token = app_context[0].state.jwt_service.issue_access_token(user.id).token

    response = await client.get("/api/auth/me", headers=authorization(token))

    assert_unauthorized(response)
