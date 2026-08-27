import uuid
from typing import Annotated

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_session
from app.errors import ApiError
from app.models.user import User
from app.services.jwt import JwtService


bearer_scheme = HTTPBearer(auto_error=False)


def authentication_error() -> ApiError:
    return ApiError(
        status_code=401,
        code="invalid_access_token",
        message="A valid Bearer access token is required.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    if credentials is None or credentials.scheme.casefold() != "bearer":
        raise authentication_error()

    jwt_service: JwtService = request.app.state.jwt_service
    try:
        claims = jwt_service.decode_access_token(credentials.credentials)
        user_id = uuid.UUID(str(claims["sub"]))
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise authentication_error() from None

    user = await session.get(User, user_id)
    if user is None or not user.is_active or user.email_verified_at is None:
        raise authentication_error()

    return user
