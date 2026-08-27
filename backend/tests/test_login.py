from datetime import datetime, timezone

import pytest

from app.models.user import User


PASSWORD = "Strong-password-123"
INVALID_RESPONSE = {
    "error": {
        "code": "invalid_credentials",
        "message": "Invalid email or password.",
    }
}


async def add_user(
    app_context,
    *,
    email: str,
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


@pytest.mark.asyncio
async def test_verified_user_can_login_with_normalized_email(client, app_context):
    user = await add_user(app_context, email="student@campus.edu")

    response = await client.post(
        "/api/auth/login",
        json={"email": "  STUDENT@CAMPUS.EDU ", "password": PASSWORD},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 900
    assert body["user"] == {"id": str(user.id), "email": "student@campus.edu"}
    assert "password" not in str(body).lower()

    claims = app_context[0].state.jwt_service.decode_access_token(
        body["access_token"]
    )
    assert claims["sub"] == str(user.id)
    assert claims["type"] == "access"


@pytest.mark.asyncio
async def test_wrong_password_and_unknown_email_have_same_response(client, app_context):
    await add_user(app_context, email="known@campus.edu")

    wrong_password = await client.post(
        "/api/auth/login",
        json={"email": "known@campus.edu", "password": "wrong"},
    )
    unknown_email = await client.post(
        "/api/auth/login",
        json={"email": "unknown@campus.edu", "password": "wrong"},
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json() == INVALID_RESPONSE
    assert wrong_password.headers["www-authenticate"] == "Bearer"


@pytest.mark.asyncio
async def test_unverified_user_is_told_to_verify(client, app_context):
    await add_user(app_context, email="pending@campus.edu", verified=False)

    response = await client.post(
        "/api/auth/login",
        json={"email": "pending@campus.edu", "password": PASSWORD},
    )

    assert response.status_code == 403
    assert response.json() == {
        "error": {
            "code": "email_verification_required",
            "message": "Verify your university email before signing in.",
        }
    }
    assert "access_token" not in response.text


@pytest.mark.asyncio
async def test_wrong_password_does_not_reveal_unverified_state(client, app_context):
    await add_user(app_context, email="pending@campus.edu", verified=False)

    response = await client.post(
        "/api/auth/login",
        json={"email": "pending@campus.edu", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json() == INVALID_RESPONSE


@pytest.mark.asyncio
async def test_disabled_user_gets_generic_invalid_credentials(client, app_context):
    await add_user(app_context, email="disabled@campus.edu", active=False)

    response = await client.post(
        "/api/auth/login",
        json={"email": "disabled@campus.edu", "password": PASSWORD},
    )

    assert response.status_code == 401
    assert response.json() == INVALID_RESPONSE


@pytest.mark.asyncio
async def test_rapid_attempts_are_rate_limited(client):
    payload = {"email": "unknown@campus.edu", "password": "wrong"}

    for _ in range(5):
        response = await client.post("/api/auth/login", json=payload)
        assert response.status_code == 401

    response = await client.post("/api/auth/login", json=payload)
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "too_many_login_attempts"
    assert int(response.headers["retry-after"]) >= 1


@pytest.mark.asyncio
async def test_invalid_request_uses_consistent_safe_error(client):
    response = await client.post(
        "/api/auth/login",
        json={"email": "not-an-email", "password": "password"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "validation_error",
            "message": "Please check the submitted fields.",
            "fields": ["email"],
        }
    }
