import hashlib
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import func, select

from app.models.auth_one_time_token import (
    AuthOneTimeToken,
    EMAIL_VERIFICATION_PURPOSE,
    PASSWORD_RESET_PURPOSE,
)
from app.models.user import User
from app.services.password_reset import FORGOT_PASSWORD_MESSAGE


PASSWORD = "Strong-password-123"
GENERIC_RESPONSE = {"message": FORGOT_PASSWORD_MESSAGE}


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def add_user(
    app_context,
    *,
    email: str,
    active: bool = True,
) -> User:
    app, session_factory = app_context
    user = User(
        email=email,
        password_hash=app.state.password_service.hash(PASSWORD),
        email_verified_at=datetime.now(timezone.utc),
        is_active=active,
    )
    async with session_factory() as session:
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_known_and_unknown_email_have_identical_public_response(
    client, app_context
):
    await add_user(app_context, email="known@campus.edu")

    known = await client.post(
        "/api/auth/forgot-password",
        json={"email": "known@campus.edu"},
    )
    unknown = await client.post(
        "/api/auth/forgot-password",
        json={"email": "unknown@campus.edu"},
    )

    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json() == GENERIC_RESPONSE


@pytest.mark.asyncio
async def test_reset_token_is_normalized_hashed_expiring_and_uses_trusted_frontend_url(
    client, app_context
):
    app, session_factory = app_context
    user = await add_user(app_context, email="student@campus.edu")

    response = await client.post(
        "/api/auth/forgot-password",
        json={"email": "  STUDENT@CAMPUS.EDU "},
        headers={"host": "attacker.example"},
    )

    assert response.status_code == 202
    assert response.json() == GENERIC_RESPONSE
    assert len(app.state.email_sender.password_reset_messages) == 1

    message = app.state.email_sender.password_reset_messages[0]
    assert message["recipient"] == "student@campus.edu"
    assert message["expires_minutes"] == 30
    reset_url = str(message["reset_url"])
    assert reset_url.startswith("http://localhost:5173/reset-password?")
    assert "attacker.example" not in reset_url

    raw_token = parse_qs(urlparse(reset_url).query)["token"][0]
    assert len(raw_token) >= 48
    assert raw_token not in response.text

    async with session_factory() as session:
        token = await session.scalar(
            select(AuthOneTimeToken).where(
                AuthOneTimeToken.user_id == user.id,
                AuthOneTimeToken.purpose == PASSWORD_RESET_PURPOSE,
            )
        )

    assert token is not None
    assert token.token_hash != raw_token
    assert token.token_hash == hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    assert len(token.token_hash) == 64
    assert token.consumed_at is None
    assert token.invalidated_at is None
    lifetime = as_utc(token.expires_at) - as_utc(token.created_at)
    assert lifetime.total_seconds() == 30 * 60


@pytest.mark.asyncio
async def test_disabled_account_gets_generic_response_without_email_or_token(
    client, app_context
):
    app, session_factory = app_context
    user = await add_user(
        app_context,
        email="disabled@campus.edu",
        active=False,
    )

    response = await client.post(
        "/api/auth/forgot-password",
        json={"email": "disabled@campus.edu"},
    )

    assert response.status_code == 202
    assert response.json() == GENERIC_RESPONSE
    assert app.state.email_sender.password_reset_messages == []
    async with session_factory() as session:
        count = await session.scalar(
            select(func.count(AuthOneTimeToken.id)).where(
                AuthOneTimeToken.user_id == user.id
            )
        )
    assert count == 0


@pytest.mark.asyncio
async def test_email_provider_failure_does_not_change_public_response_or_lose_token(
    client, app_context
):
    app, session_factory = app_context
    user = await add_user(app_context, email="provider-fail@campus.edu")
    app.state.email_sender.fail_password_reset = True

    response = await client.post(
        "/api/auth/forgot-password",
        json={"email": "provider-fail@campus.edu"},
    )

    assert response.status_code == 202
    assert response.json() == GENERIC_RESPONSE
    async with session_factory() as session:
        count = await session.scalar(
            select(func.count(AuthOneTimeToken.id)).where(
                AuthOneTimeToken.user_id == user.id,
                AuthOneTimeToken.purpose == PASSWORD_RESET_PURPOSE,
            )
        )
    assert count == 1


@pytest.mark.asyncio
async def test_email_cooldown_silently_prevents_duplicate_token_and_email(
    client, app_context
):
    app, session_factory = app_context
    user = await add_user(app_context, email="cooldown@campus.edu")

    first = await client.post(
        "/api/auth/forgot-password",
        json={"email": "cooldown@campus.edu"},
    )
    second = await client.post(
        "/api/auth/forgot-password",
        json={"email": "COOLDOWN@CAMPUS.EDU"},
    )

    assert first.status_code == second.status_code == 202
    assert first.json() == second.json() == GENERIC_RESPONSE
    assert len(app.state.email_sender.password_reset_messages) == 1
    async with session_factory() as session:
        count = await session.scalar(
            select(func.count(AuthOneTimeToken.id)).where(
                AuthOneTimeToken.user_id == user.id,
                AuthOneTimeToken.purpose == PASSWORD_RESET_PURPOSE,
            )
        )
    assert count == 1


@pytest.mark.asyncio
async def test_ip_rate_limit_applies_without_revealing_account_state(client):
    for index in range(10):
        response = await client.post(
            "/api/auth/forgot-password",
            json={"email": f"unknown-{index}@campus.edu"},
        )
        assert response.status_code == 202
        assert response.json() == GENERIC_RESPONSE

    limited = await client.post(
        "/api/auth/forgot-password",
        json={"email": "another-unknown@campus.edu"},
    )

    assert limited.status_code == 429
    assert limited.json() == {
        "error": {
            "code": "too_many_password_reset_requests",
            "message": "Too many password reset requests. Please try again later.",
        }
    }
    assert int(limited.headers["retry-after"]) >= 1


@pytest.mark.asyncio
async def test_new_reset_token_invalidates_previous_reset_but_not_verification_token(
    app_context,
):
    app, session_factory = app_context
    user = await add_user(app_context, email="rotate-reset@campus.edu")

    async with session_factory() as session:
        verification = AuthOneTimeToken(
            user_id=user.id,
            purpose=EMAIL_VERIFICATION_PURPOSE,
            token_hash="a" * 64,
            expires_at=datetime(2030, 1, 1, tzinfo=timezone.utc),
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        session.add(verification)
        await session.commit()

        first = await app.state.one_time_token_service.issue_password_reset(
            session,
            user,
            now=datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc),
        )
        second = await app.state.one_time_token_service.issue_password_reset(
            session,
            user,
            now=datetime(2026, 8, 25, 12, 1, tzinfo=timezone.utc),
        )

        reset_tokens = list(
            (
                await session.scalars(
                    select(AuthOneTimeToken)
                    .where(
                        AuthOneTimeToken.user_id == user.id,
                        AuthOneTimeToken.purpose == PASSWORD_RESET_PURPOSE,
                    )
                    .order_by(AuthOneTimeToken.created_at)
                )
            ).all()
        )
        await session.refresh(verification)

    assert first.credential != second.credential
    assert len(reset_tokens) == 2
    assert reset_tokens[0].invalidated_at is not None
    assert reset_tokens[1].invalidated_at is None
    assert verification.invalidated_at is None
    assert verification.consumed_at is None


@pytest.mark.asyncio
async def test_invalid_email_uses_standard_validation_error(client):
    response = await client.post(
        "/api/auth/forgot-password",
        json={"email": "not-an-email"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "validation_error",
            "message": "Please check the submitted fields.",
            "fields": ["email"],
        }
    }
