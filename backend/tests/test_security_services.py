import uuid
from datetime import datetime, timezone

from app.services.auth import normalize_email
from app.services.jwt import JwtService
from app.services.password import PasswordPolicyError, PasswordService


def test_password_service_uses_argon2_and_never_returns_plaintext():
    service = PasswordService()
    password = "Correct horse battery staple"

    password_hash = service.hash(password)

    assert password_hash.startswith("$argon2")
    assert password not in password_hash
    assert service.verify(password, password_hash)
    assert not service.verify("wrong", password_hash)
    assert not service.verify(password, None)


def test_password_policy_is_centralized_in_password_service():
    service = PasswordService()

    for invalid in ("short", " " * 12, "x" * 129):
        try:
            service.validate_new_password(invalid)
        except PasswordPolicyError:
            pass
        else:
            raise AssertionError("invalid password unexpectedly passed policy")

    service.validate_new_password("Valid-password-123")


def test_jwt_service_issues_expected_short_lived_claims():
    service = JwtService(
        secret_key="test-secret-key-that-is-at-least-32-characters",
        algorithm="HS256",
        issuer="uniswap-api",
        audience="uniswap-web",
        expires_minutes=15,
    )
    user_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    issued = service.issue_access_token(user_id, now=now)
    claims = service.decode_access_token(issued.token)

    assert issued.expires_in == 900
    assert claims["sub"] == str(user_id)
    assert claims["iss"] == "uniswap-api"
    assert claims["aud"] == "uniswap-web"
    assert claims["exp"] - claims["iat"] == 900
    assert set(claims) == {"sub", "type", "iss", "aud", "iat", "exp", "jti"}


def test_email_normalization_is_trimmed_and_casefolded():
    assert normalize_email("  Student@CAMPUS.EDU ") == "student@campus.edu"
