import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt


@dataclass(frozen=True, slots=True)
class IssuedAccessToken:
    token: str
    expires_in: int


class JwtService:
    def __init__(
        self,
        *,
        secret_key: str,
        algorithm: str,
        issuer: str,
        audience: str,
        expires_minutes: int,
    ) -> None:
        self._secret_key = secret_key
        self._algorithm = algorithm
        self._issuer = issuer
        self._audience = audience
        self._expires_minutes = expires_minutes

    def issue_access_token(
        self, user_id: uuid.UUID, *, now: datetime | None = None
    ) -> IssuedAccessToken:
        issued_at = now or datetime.now(timezone.utc)
        expires_at = issued_at + timedelta(minutes=self._expires_minutes)
        expires_in = self._expires_minutes * 60
        claims = {
            "sub": str(user_id),
            "type": "access",
            "iss": self._issuer,
            "aud": self._audience,
            "iat": issued_at,
            "exp": expires_at,
            "jti": str(uuid.uuid4()),
        }
        return IssuedAccessToken(
            token=jwt.encode(
                claims,
                self._secret_key,
                algorithm=self._algorithm,
            ),
            expires_in=expires_in,
        )

    def decode_access_token(self, token: str) -> dict[str, object]:
        claims = jwt.decode(
            token,
            self._secret_key,
            algorithms=[self._algorithm],
            issuer=self._issuer,
            audience=self._audience,
            options={
                "require": ["sub", "type", "iss", "aud", "iat", "exp", "jti"],
                "strict_aud": True,
            },
        )
        if claims.get("type") != "access":
            raise jwt.InvalidTokenError("Unexpected token type")
        return claims
