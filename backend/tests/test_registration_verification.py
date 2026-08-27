from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.auth_one_time_token import AuthOneTimeToken, EMAIL_VERIFICATION_PURPOSE
from app.models.user import User
from app.services.one_time_token import hash_verification_code


PASSWORD = "Strong-password-123"


@pytest.mark.asyncio
async def test_register_normalizes_student_id_and_sends_code(client, app_context):
    app, session_factory = app_context
    response = await client.post(
        "/api/auth/register",
        json={
            "student_id": " itbin12345678 ",
            "email": " Student@Campus.edu ",
            "password": PASSWORD,
        },
    )
    assert response.status_code == 202
    assert response.json()["student_id"] == "ITBIN12345678"
    assert len(app.state.email_sender.verification_messages) == 1
    message = app.state.email_sender.verification_messages[0]
    assert message["recipient"] == "student@campus.edu"
    assert len(message["code"]) == 6 and message["code"].isdigit()

    async with session_factory() as session:
        user = await session.scalar(select(User).where(User.student_id == "ITBIN12345678"))
        assert user is not None
        assert user.email == "student@campus.edu"
        assert user.email_verified_at is None
        token = await session.scalar(
            select(AuthOneTimeToken).where(
                AuthOneTimeToken.user_id == user.id,
                AuthOneTimeToken.purpose == EMAIL_VERIFICATION_PURPOSE,
            )
        )
        assert token is not None
        assert token.token_hash != message["code"]
        assert token.token_hash == hash_verification_code(
            user_id=user.id,
            code=message["code"],
            pepper=app.state.settings.jwt_secret_key.get_secret_value().encode(),
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("student_id", ["ITBIN123", "ITBIN1234567A", "XXBIN12345678"])
async def test_register_rejects_invalid_student_id(client, student_id):
    response = await client.post(
        "/api/auth/register",
        json={"student_id": student_id, "email": "student@campus.edu", "password": PASSWORD},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


@pytest.mark.asyncio
async def test_register_rejects_unapproved_email_domain(client):
    response = await client.post(
        "/api/auth/register",
        json={"student_id": "ITBIN12345678", "email": "student@gmail.com", "password": PASSWORD},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "student_email_domain_not_allowed"


@pytest.mark.asyncio
async def test_verification_code_is_single_use_and_enables_student_id_login(client, app_context):
    app, _ = app_context
    await client.post(
        "/api/auth/register",
        json={"student_id": "ITBIN12345678", "email": "student@campus.edu", "password": PASSWORD},
    )
    code = app.state.email_sender.verification_messages[-1]["code"]

    verify = await client.post(
        "/api/auth/verify-email",
        json={"student_id": "ITBIN12345678", "code": code},
    )
    assert verify.status_code == 200

    reuse = await client.post(
        "/api/auth/verify-email",
        json={"student_id": "ITBIN12345678", "code": code},
    )
    assert reuse.status_code == 400
    assert reuse.json()["error"]["code"] == "invalid_verification_code"

    login = await client.post(
        "/api/auth/login",
        json={"student_id": "ITBIN12345678", "password": PASSWORD},
    )
    assert login.status_code == 200
    assert login.json()["user"]["student_id"] == "ITBIN12345678"


@pytest.mark.asyncio
async def test_wrong_or_expired_code_does_not_verify_user(client, app_context):
    app, session_factory = app_context
    await client.post(
        "/api/auth/register",
        json={"student_id": "ITBIN87654321", "email": "second@campus.edu", "password": PASSWORD},
    )
    wrong = await client.post(
        "/api/auth/verify-email",
        json={"student_id": "ITBIN87654321", "code": "000000"},
    )
    assert wrong.status_code == 400

    async with session_factory() as session:
        user = await session.scalar(select(User).where(User.student_id == "ITBIN87654321"))
        token = await session.scalar(
            select(AuthOneTimeToken).where(AuthOneTimeToken.user_id == user.id)
        )
        expired_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        token.created_at = expired_at - timedelta(minutes=1)
        token.expires_at = expired_at
        await session.commit()
    code = app.state.email_sender.verification_messages[-1]["code"]
    expired = await client.post(
        "/api/auth/verify-email",
        json={"student_id": "ITBIN87654321", "code": code},
    )
    assert expired.status_code == 400

    async with session_factory() as session:
        user = await session.scalar(select(User).where(User.student_id == "ITBIN87654321"))
        assert user.email_verified_at is None


@pytest.mark.asyncio
async def test_resend_invalidates_previous_code_and_is_generic(client, app_context):
    app, _ = app_context
    await client.post(
        "/api/auth/register",
        json={"student_id": "ITBIN11112222", "email": "resend@campus.edu", "password": PASSWORD},
    )
    first = app.state.email_sender.verification_messages[-1]["code"]
    # Simulate the configured resend cooldown elapsing.
    app.state.email_verification_rate_limiter._resend_last.clear()
    resend = await client.post(
        "/api/auth/resend-verification",
        json={"student_id": "ITBIN11112222"},
    )
    assert resend.status_code == 202
    second = app.state.email_sender.verification_messages[-1]["code"]
    assert second != first

    old = await client.post(
        "/api/auth/verify-email",
        json={"student_id": "ITBIN11112222", "code": first},
    )
    assert old.status_code == 400

    unknown = await client.post(
        "/api/auth/resend-verification",
        json={"student_id": "ITBIN99999999"},
    )
    assert unknown.status_code == resend.status_code
    assert unknown.json() == resend.json()


@pytest.mark.asyncio
async def test_failed_code_attempts_are_persisted_and_exhaust_token(client, app_context):
    app, session_factory = app_context
    await client.post(
        "/api/auth/register",
        json={"student_id": "ITBIN33334444", "email": "attempts@campus.edu", "password": PASSWORD},
    )

    for code in ["000001", "000002", "000003", "000004", "000005", "000006"]:
        response = await client.post(
            "/api/auth/verify-email",
            json={"student_id": "ITBIN33334444", "code": code},
        )
        assert response.status_code == 400

    async with session_factory() as session:
        user = await session.scalar(select(User).where(User.student_id == "ITBIN33334444"))
        token = await session.scalar(
            select(AuthOneTimeToken).where(
                AuthOneTimeToken.user_id == user.id,
                AuthOneTimeToken.purpose == EMAIL_VERIFICATION_PURPOSE,
            )
        )
        assert token.attempt_count == 6
        assert token.invalidated_at is not None

    # The raw correct code from the email cannot revive an exhausted token.
    correct_code = app.state.email_sender.verification_messages[-1]["code"]
    app.state.email_verification_rate_limiter._attempt_log.clear()
    rejected = await client.post(
        "/api/auth/verify-email",
        json={"student_id": "ITBIN33334444", "code": correct_code},
    )
    assert rejected.status_code == 400
    assert rejected.json()["error"]["code"] == "invalid_verification_code"
