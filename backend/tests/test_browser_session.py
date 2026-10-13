from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import update

from app.errors import ApiError
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.session import hash_refresh_token
from test_refresh_sessions import COOKIE_NAME, CSRF_HEADERS, login, use_refresh_cookie


@pytest.mark.asyncio
async def test_signed_out_bootstrap_is_successful_and_not_cached(client):
    response = await client.post("/api/auth/session", headers=CSRF_HEADERS)
    assert response.status_code == 200
    assert response.json() is None
    assert response.headers["cache-control"] == "no-store"
    assert "set-cookie" not in response.headers
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (await client.post("/api/auth/refresh", headers=CSRF_HEADERS)).status_code == 401


@pytest.mark.asyncio
async def test_bootstrap_restores_valid_cookie_and_returns_usable_access_token(client, app_context):
    user, old_credential, _ = await login(client, app_context)
    response = await client.post("/api/auth/session", headers=CSRF_HEADERS)
    assert response.status_code == 200
    assert response.json()["user"]["id"] == str(user.id)
    assert response.cookies[COOKIE_NAME] != old_credential
    assert response.headers["cache-control"] == "no-store"
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {response.json()['access_token']}"})
    assert me.status_code == 200
    assert me.json()["id"] == str(user.id)


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_state", ["malformed", "expired", "revoked", "unverified"])
async def test_invalid_cookie_becomes_signed_out_and_is_cleared(client, app_context, invalid_state):
    user, credential, _ = await login(client, app_context)
    _, session_factory = app_context
    if invalid_state == "malformed":
        credential = "malformed-cookie"
    elif invalid_state == "revoked":
        await client.post("/api/auth/logout", headers=CSRF_HEADERS)
    else:
        async with session_factory() as session:
            if invalid_state == "unverified":
                await session.execute(update(User).where(User.id == user.id).values(email_verified_at=None))
            else:
                now = datetime.now(timezone.utc)
                await session.execute(update(AuthSession).where(AuthSession.token_hash == hash_refresh_token(credential)).values(
                    created_at=now - timedelta(days=2), expires_at=now - timedelta(days=1),
                ))
            await session.commit()
    use_refresh_cookie(client, credential)
    response = await client.post("/api/auth/session", headers=CSRF_HEADERS)
    assert response.status_code == 200
    assert response.json() is None
    assert "Max-Age=0" in response.headers["set-cookie"]


@pytest.mark.asyncio
async def test_bootstrap_requires_csrf_header(client):
    response = await client.post("/api/auth/session")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_protection_required"


@pytest.mark.asyncio
async def test_bootstrap_does_not_hide_other_api_errors(client, app_context):
    app, _ = app_context
    use_refresh_cookie(client, "test-credential")
    app.state.auth_service.refresh = AsyncMock(side_effect=ApiError(
        status_code=503, code="service_unavailable", message="Try later.",
    ))
    response = await client.post("/api/auth/session", headers=CSRF_HEADERS)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"
