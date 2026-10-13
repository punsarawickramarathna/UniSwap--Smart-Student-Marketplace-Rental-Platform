# UniSwap Backend Code Documentation

This document captures the backend source for the UniSwap Smart Student Marketplace & Rental Platform. The backend is built with FastAPI, SQLAlchemy, PostgreSQL/Supabase, and JWT-based authentication.

## 1. Backend project structure

```text
backend/
├── app/
│   ├── config.py
│   ├── database.py
│   ├── errors.py
│   ├── main.py
│   ├── dependencies/
│   │   ├── auth.py
│   │   └── database.py
│   ├── models/
│   │   ├── auth_one_time_token.py
│   │   ├── auth_session.py
│   │   ├── user.py
│   │   └── __init__.py
│   ├── routes/
│   │   ├── auth.py
│   │   └── __init__.py
│   ├── schemas/
│   │   ├── auth.py
│   │   └── __init__.py
│   ├── services/
│   │   ├── auth.py
│   │   ├── email.py
│   │   ├── identity.py
│   │   ├── jwt.py
│   │   ├── one_time_token.py
│   │   ├── password.py
│   │   ├── password_reset.py
│   │   ├── rate_limit.py
│   │   ├── registration.py
│   │   ├── session.py
│   │   └── __init__.py
│   └── utils/
│       └──
├── requirements.txt
├── tests/
└── README.md
```

---

## 2. Backend dependencies

```txt
fastapi==0.141.1
SQLAlchemy==2.0.52
greenlet==3.5.5
asyncpg==0.31.0
pwdlib[argon2]==0.3.1
PyJWT==2.13.0
pydantic-settings==2.15.0
email-validator==2.3.0
uvicorn[standard]==0.52.4
```

---

## 3. App bootstrap

### backend/app/main.py

```python
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config import Settings, get_settings
from app.database import create_database_engine, create_session_factory
from app.errors import register_error_handlers
from app.routes.auth import router as auth_router
from app.services.auth import AuthService
from app.services.email import EmailSender, SmtpEmailSender
from app.services.jwt import JwtService
from app.services.one_time_token import OneTimeTokenService
from app.services.password import PasswordService
from app.services.password_reset import PasswordResetService
from app.services.registration import RegistrationService
from app.services.rate_limit import (
    EmailVerificationRateLimiter,
    LoginRateLimiter,
    PasswordResetRateLimiter,
)
from app.services.session import SessionService


def create_app(
    *,
    settings: Settings | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
    email_sender: EmailSender | None = None,
) -> FastAPI:
    active_settings = settings or get_settings()
    engine: AsyncEngine | None = None
    if session_factory is None:
        engine = create_database_engine(active_settings.database_url)
        session_factory = create_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        if engine is not None:
            await engine.dispose()

    app = FastAPI(title="UniSwap API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-CSRF-Protection"],
    )

    password_service = PasswordService()
    jwt_service = JwtService(
        secret_key=active_settings.jwt_secret_key.get_secret_value(),
        algorithm=active_settings.jwt_algorithm,
        issuer=active_settings.jwt_issuer,
        audience=active_settings.jwt_audience,
        expires_minutes=active_settings.jwt_access_token_expire_minutes,
    )
    app.state.settings = active_settings
    app.state.session_factory = session_factory
    app.state.password_service = password_service
    app.state.jwt_service = jwt_service
    session_service = SessionService(
        expires_days=active_settings.refresh_session_expire_days,
        rotation_grace_seconds=active_settings.refresh_rotation_grace_seconds,
    )
    app.state.session_service = session_service
    app.state.auth_service = AuthService(
        password_service=password_service,
        jwt_service=jwt_service,
        rate_limiter=LoginRateLimiter(
            attempts=active_settings.login_rate_limit_attempts,
            window_seconds=active_settings.login_rate_limit_window_seconds,
        ),
        session_service=session_service,
    )

    active_email_sender = email_sender or SmtpEmailSender(
        mail_from=active_settings.mail_from,
        smtp_host=active_settings.smtp_host,
        smtp_port=active_settings.smtp_port,
        smtp_username=active_settings.smtp_username,
        smtp_password=(
            active_settings.smtp_password.get_secret_value()
            if active_settings.smtp_password
            else None
        ),
        use_starttls=active_settings.smtp_use_starttls,
    )
    one_time_token_service = OneTimeTokenService(
        password_reset_expire_minutes=(
            active_settings.password_reset_token_expire_minutes
        ),
        email_verification_expire_minutes=(
            active_settings.email_verification_token_expire_minutes
        ),
        verification_pepper=active_settings.jwt_secret_key.get_secret_value(),
        verification_max_attempts=active_settings.email_verification_attempts,
    )
    password_reset_rate_limiter = PasswordResetRateLimiter(
        attempts=active_settings.password_reset_rate_limit_attempts,
        window_seconds=active_settings.password_reset_rate_limit_window_seconds,
        email_cooldown_seconds=active_settings.password_reset_cooldown_seconds,
    )
    app.state.one_time_token_service = one_time_token_service
    app.state.password_reset_rate_limiter = password_reset_rate_limiter
    app.state.email_sender = active_email_sender
    email_verification_rate_limiter = EmailVerificationRateLimiter(
        attempts=active_settings.email_verification_attempts,
        window_seconds=active_settings.email_verification_window_seconds,
        resend_cooldown_seconds=(
            active_settings.email_verification_resend_cooldown_seconds
        ),
    )
    app.state.email_verification_rate_limiter = email_verification_rate_limiter
    app.state.registration_service = RegistrationService(
        password_service=password_service,
        token_service=one_time_token_service,
        email_sender=active_email_sender,
        rate_limiter=email_verification_rate_limiter,
        allowed_domains=active_settings.allowed_student_domains,
        verification_expire_minutes=(
            active_settings.email_verification_token_expire_minutes
        ),
    )
    app.state.password_reset_service = PasswordResetService(
        token_service=one_time_token_service,
        email_sender=active_email_sender,
        rate_limiter=password_reset_rate_limiter,
        frontend_base_url=active_settings.frontend_base_url,
        token_expire_minutes=active_settings.password_reset_token_expire_minutes,
        password_service=password_service,
        session_service=session_service,
    )

    register_error_handlers(app)
    app.include_router(auth_router)
    return app


app: Any = create_app()
```

---

## 4. App configuration

### backend/app/config.py

```python
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    app_env: Literal["development", "test", "production"] = "development"
    database_url: str
    frontend_base_url: str = "http://localhost:5173"
    cors_allowed_origins: str = "http://localhost:5173,http://localhost:5174"

    jwt_secret_key: SecretStr = Field(min_length=32)
    jwt_algorithm: Literal["HS256"] = "HS256"
    jwt_issuer: str = "uniswap-api"
    jwt_audience: str = "uniswap-web"
    jwt_access_token_expire_minutes: int = Field(default=15, ge=1, le=60)
    refresh_session_expire_days: int = Field(default=30, ge=1, le=90)
    refresh_rotation_grace_seconds: int = Field(default=10, ge=0, le=60)
    refresh_cookie_name: str = "uniswap_refresh"
    refresh_cookie_secure: bool = False
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    refresh_cookie_path: str = "/api/auth"

    login_rate_limit_attempts: int = Field(default=5, ge=1, le=100)
    login_rate_limit_window_seconds: int = Field(default=60, ge=1, le=3600)

    allowed_student_email_domains: str = "horizoncampus.edu.lk"
    email_verification_token_expire_minutes: int = Field(default=10, ge=2, le=60)
    email_verification_attempts: int = Field(default=6, ge=3, le=20)
    email_verification_window_seconds: int = Field(default=600, ge=60, le=3600)
    email_verification_resend_cooldown_seconds: int = Field(default=60, ge=10, le=3600)

    password_reset_token_expire_minutes: int = Field(default=30, ge=5, le=1440)
    password_reset_rate_limit_attempts: int = Field(default=10, ge=1, le=100)
    password_reset_rate_limit_window_seconds: int = Field(default=60, ge=1, le=3600)
    password_reset_cooldown_seconds: int = Field(default=60, ge=0, le=3600)

    mail_from: str = "no-reply@example.edu"
    smtp_host: str = "localhost"
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_use_starttls: bool = True

    model_config = SettingsConfigDict(
        env_file=(ROOT_ENV_FILE, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("database_url")
    @classmethod
    def require_async_database_driver(cls, value: str) -> str:
        if not value.startswith(("postgresql+asyncpg://", "sqlite+aiosqlite://")):
            raise ValueError("DATABASE_URL must use asyncpg or aiosqlite")
        return value

    @model_validator(mode="after")
    def validate_browser_security_settings(self) -> "Settings":
        if "*" in self.cors_origins:
            raise ValueError(
                "CORS_ALLOWED_ORIGINS must be explicit when cookies are enabled"
            )
        if self.refresh_cookie_samesite == "none" and not self.refresh_cookie_secure:
            raise ValueError("SameSite=None refresh cookies must be Secure")
        if self.app_env == "production" and not self.refresh_cookie_secure:
            raise ValueError("Production refresh cookies must be Secure")
        return self

    @property
    def allowed_student_domains(self) -> set[str]:
        return {
            domain.strip().casefold().lstrip("@")
            for domain in self.allowed_student_email_domains.split(",")
            if domain.strip()
        }

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip().rstrip("/")
            for origin in self.cors_allowed_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
```

---

## 5. Database layer

### backend/app/database.py

```python
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def create_database_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(database_url, pool_pre_ping=True)


def create_session_factory(
    engine: AsyncEngine,
) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def session_from_factory(
    factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    async with factory() as session:
        yield session
```

---

## 6. Core models

### backend/app/models/user.py

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "email = lower(trim(email))", name="users_email_normalized_check"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    student_id: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
```

### backend/app/models/auth_session.py

```python
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.user import utc_now


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        CheckConstraint(
            "length(token_hash) = 64",
            name="auth_sessions_token_hash_length_check",
        ),
        CheckConstraint(
            "expires_at > created_at",
            name="auth_sessions_expiry_check",
        ),
        CheckConstraint(
            "replaced_by_session_id is null or replaced_by_session_id <> id",
            name="auth_sessions_replacement_check",
        ),
        Index(
            "auth_sessions_active_user_idx",
            "user_id",
            "expires_at",
            postgresql_where=text("revoked_at is null"),
            sqlite_where=text("revoked_at is null"),
        ),
        Index(
            "auth_sessions_active_family_idx",
            "family_id",
            postgresql_where=text("revoked_at is null"),
            sqlite_where=text("revoked_at is null"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, default=uuid.uuid4
    )
    token_hash: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    replaced_by_session_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("auth_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    reuse_detected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
```

### backend/app/models/auth_one_time_token.py

```python
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.user import utc_now


PASSWORD_RESET_PURPOSE = "password_reset"
EMAIL_VERIFICATION_PURPOSE = "email_verification"


class AuthOneTimeToken(Base):
    __tablename__ = "auth_one_time_tokens"
    __table_args__ = (
        CheckConstraint(
            "length(token_hash) = 64",
            name="auth_one_time_tokens_hash_length_check",
        ),
        CheckConstraint(
            "purpose in ('email_verification', 'password_reset')",
            name="auth_one_time_tokens_purpose_check",
        ),
        CheckConstraint(
            "expires_at > created_at",
            name="auth_one_time_tokens_expiry_check",
        ),
        CheckConstraint(
            "attempt_count >= 0",
            name="auth_one_time_tokens_attempt_count_check",
        ),
        Index(
            "auth_one_time_tokens_active_user_purpose_idx",
            "user_id",
            "purpose",
            "expires_at",
            postgresql_where=text(
                "consumed_at is null and invalidated_at is null"
            ),
            sqlite_where=text("consumed_at is null and invalidated_at is null"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    invalidated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
```

---

## 7. Security, exceptions, and dependencies

### backend/app/errors.py

```python
from dataclasses import dataclass, field

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


@dataclass(slots=True)
class ApiError(Exception):
    status_code: int
    code: str
    message: str
    headers: dict[str, str] = field(default_factory=dict)


def error_payload(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(exc.code, exc.message),
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        fields = sorted(
            {
                str(error["loc"][-1])
                for error in exc.errors()
                if error.get("loc")
            }
        )
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "Please check the submitted fields.",
                    "fields": fields,
                }
            },
        )
```

### backend/app/dependencies/auth.py

```python
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
```

### backend/app/dependencies/database.py

```python
from collections.abc import AsyncIterator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import session_from_factory
from app.main import app


async def get_session() -> AsyncIterator[AsyncSession]:
    async for session in session_from_factory(app.state.session_factory):
        yield session
```

---

## 8. API schemas for authentication

### backend/app/schemas/auth.py

```python
import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, SecretStr, field_validator, model_validator

from app.services.identity import is_valid_student_id, normalize_student_id


class LoginRequest(BaseModel):
    student_id: str | None = Field(default=None, max_length=13)
    email: EmailStr | None = None
    password: SecretStr = Field(min_length=1, max_length=1024)

    @field_validator("email", mode="before")
    @classmethod
    def strip_email(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("student_id", mode="before")
    @classmethod
    def normalize_id(cls, value: object) -> object:
        return normalize_student_id(value) if isinstance(value, str) else value

    @model_validator(mode="after")
    def require_one_identifier(self) -> "LoginRequest":
        if bool(self.student_id) == bool(self.email):
            raise ValueError("Provide exactly one login identifier.")
        if self.student_id and not is_valid_student_id(self.student_id):
            raise ValueError("Student ID must be ITBIN followed by 8 digits.")
        return self


class AuthenticatedUser(BaseModel):
    id: uuid.UUID
    student_id: str | None = None
    email: EmailStr


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: AuthenticatedUser


class RegisterRequest(BaseModel):
    student_id: str = Field(min_length=13, max_length=13)
    email: EmailStr
    password: SecretStr = Field(min_length=1, max_length=1024)

    @field_validator("student_id", mode="before")
    @classmethod
    def normalize_id(cls, value: object) -> object:
        return normalize_student_id(value) if isinstance(value, str) else value

    @field_validator("student_id")
    @classmethod
    def validate_student_id(cls, value: str) -> str:
        if not is_valid_student_id(value):
            raise ValueError("Student ID must be ITBIN followed by 8 digits.")
        return value

    @field_validator("email", mode="before")
    @classmethod
    def strip_email(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class RegisterResponse(BaseModel):
    message: str
    student_id: str


class VerifyEmailRequest(BaseModel):
    student_id: str = Field(min_length=13, max_length=13)
    code: str = Field(pattern=r"^\d{6}$")

    @field_validator("student_id", mode="before")
    @classmethod
    def normalize_id(cls, value: object) -> object:
        return normalize_student_id(value) if isinstance(value, str) else value

    @field_validator("student_id")
    @classmethod
    def validate_student_id(cls, value: str) -> str:
        if not is_valid_student_id(value):
            raise ValueError("Student ID must be ITBIN followed by 8 digits.")
        return value


class VerifyEmailResponse(BaseModel):
    message: str


class ResendVerificationRequest(BaseModel):
    student_id: str = Field(min_length=13, max_length=13)

    @field_validator("student_id", mode="before")
    @classmethod
    def normalize_id(cls, value: object) -> object:
        return normalize_student_id(value) if isinstance(value, str) else value

    @field_validator("student_id")
    @classmethod
    def validate_student_id(cls, value: str) -> str:
        if not is_valid_student_id(value):
            raise ValueError("Student ID must be ITBIN followed by 8 digits.")
        return value


class ResendVerificationResponse(BaseModel):
    message: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def strip_email(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class ForgotPasswordResponse(BaseModel):
    message: str


class ResetPasswordRequest(BaseModel):
    token: SecretStr = Field(min_length=1, max_length=2048)
    new_password: SecretStr = Field(min_length=1, max_length=1024)


class ResetPasswordResponse(BaseModel):
    message: str
```

---

## 9. Authentication routes

### backend/app/routes/auth.py

```python
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.dependencies.auth import get_current_user
from app.dependencies.database import get_session
from app.errors import ApiError
from app.models.user import User
from app.schemas.auth import (
    AuthenticatedUser,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
    ResendVerificationRequest,
    ResendVerificationResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from app.services.auth import AuthResult, AuthService
from app.services.password_reset import (
    FORGOT_PASSWORD_MESSAGE,
    RESET_PASSWORD_MESSAGE,
    PasswordResetService,
)
from app.services.registration import (
    REGISTER_MESSAGE,
    RESEND_MESSAGE,
    VERIFY_MESSAGE,
    RegistrationService,
)
from app.services.session import invalid_refresh_session_error


router = APIRouter(prefix="/api/auth", tags=["auth"])


def get_auth_service(request: Request) -> AuthService:
    return request.app.state.auth_service


def get_password_reset_service(request: Request) -> PasswordResetService:
    return request.app.state.password_reset_service


def get_registration_service(request: Request) -> RegistrationService:
    return request.app.state.registration_service


def require_csrf_protection(
    x_csrf_protection: Annotated[
        str | None,
        Header(alias="X-CSRF-Protection"),
    ] = None,
) -> None:
    if x_csrf_protection != "1":
        raise ApiError(
            status_code=403,
            code="csrf_protection_required",
            message="The required request protection header is missing.",
        )


def set_refresh_cookie(
    response: Response,
    result: AuthResult,
    settings: Settings,
) -> None:
    if result.refresh_credential is None:
        return

    expires_at = result.refresh_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    max_age = max(
        0,
        int((expires_at - datetime.now(timezone.utc)).total_seconds()),
    )
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=result.refresh_credential,
        max_age=max_age,
        expires=expires_at,
        path=settings.refresh_cookie_path,
        secure=settings.refresh_cookie_secure,
        httponly=True,
        samesite=settings.refresh_cookie_samesite,
    )


def clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
        secure=settings.refresh_cookie_secure,
        httponly=True,
        samesite=settings.refresh_cookie_samesite,
    )


@router.post(
    "/register",
    status_code=202,
    response_model=RegisterResponse,
    responses={
        409: {"description": "Student ID or email is already registered"},
        422: {"description": "Invalid student ID, university email, or password"},
    },
)
async def register(
    payload: RegisterRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    registration_service: RegistrationService = Depends(get_registration_service),
) -> RegisterResponse:
    user, delivery = await registration_service.register(
        session,
        student_id=payload.student_id,
        email=str(payload.email),
        password=payload.password.get_secret_value(),
    )
    background_tasks.add_task(
        registration_service.deliver_verification_email,
        delivery,
    )
    return RegisterResponse(message=REGISTER_MESSAGE, student_id=user.student_id or "")


@router.post(
    "/verify-email",
    response_model=VerifyEmailResponse,
    responses={
        400: {"description": "Invalid or expired verification code"},
        429: {"description": "Too many verification attempts"},
    },
)
async def verify_email(
    payload: VerifyEmailRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    registration_service: RegistrationService = Depends(get_registration_service),
) -> VerifyEmailResponse:
    client_ip = request.client.host if request.client else "unknown"
    await registration_service.verify_email(
        session,
        student_id=payload.student_id,
        code=payload.code,
        client_ip=client_ip,
    )
    return VerifyEmailResponse(message=VERIFY_MESSAGE)


@router.post(
    "/resend-verification",
    status_code=202,
    response_model=ResendVerificationResponse,
)
async def resend_verification(
    payload: ResendVerificationRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    registration_service: RegistrationService = Depends(get_registration_service),
) -> ResendVerificationResponse:
    delivery = await registration_service.request_resend(
        session,
        student_id=payload.student_id,
    )
    if delivery is not None:
        background_tasks.add_task(
            registration_service.deliver_verification_email,
            delivery,
        )
    return ResendVerificationResponse(message=RESEND_MESSAGE)


@router.post(
    "/login",
    response_model=LoginResponse,
    response_model_exclude_none=True,
    responses={
        401: {"description": "Invalid credentials"},
        403: {"description": "Email verification required"},
        429: {"description": "Too many login attempts"},
    },
)
async def login(
    credentials: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
    auth_service: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    client_ip = request.client.host if request.client else "unknown"
    result = await auth_service.login(
        session,
        credentials,
        client_ip=client_ip,
    )
    set_refresh_cookie(response, result, request.app.state.settings)
    return result.response


@router.post(
    "/forgot-password",
    status_code=202,
    response_model=ForgotPasswordResponse,
    responses={429: {"description": "Too many password reset requests"}},
)
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    password_reset_service: PasswordResetService = Depends(get_password_reset_service),
) -> ForgotPasswordResponse:
    client_ip = request.client.host if request.client else "unknown"
    delivery = await password_reset_service.request_reset(
        session,
        str(payload.email),
        client_ip=client_ip,
    )
    if delivery is not None:
        background_tasks.add_task(
            password_reset_service.deliver_reset_email,
            delivery,
        )
    return ForgotPasswordResponse(message=FORGOT_PASSWORD_MESSAGE)


@router.post(
    "/reset-password",
    response_model=ResetPasswordResponse,
)
async def reset_password(
    payload: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
    password_reset_service: PasswordResetService = Depends(get_password_reset_service),
) -> ResetPasswordResponse:
    await password_reset_service.reset_password(
        session,
        credential=payload.token.get_secret_value(),
        new_password=payload.new_password.get_secret_value(),
    )
    return ResetPasswordResponse(message=RESET_PASSWORD_MESSAGE)
```

---

## 10. Authentication and session logic

### backend/app/services/auth.py

```python
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models.user import User
from app.schemas.auth import AuthenticatedUser, LoginRequest, LoginResponse
from app.services.identity import normalize_email, normalize_student_id
from app.services.jwt import JwtService
from app.services.password import PasswordService
from app.services.rate_limit import LoginRateLimiter
from app.services.session import SessionService


@dataclass(frozen=True, slots=True)
class AuthResult:
    response: LoginResponse
    refresh_credential: str | None
    refresh_expires_at: datetime


def invalid_credentials_error() -> ApiError:
    return ApiError(
        status_code=401,
        code="invalid_credentials",
        message="Invalid email or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )


class AuthService:
    def __init__(
        self,
        *,
        password_service: PasswordService,
        jwt_service: JwtService,
        rate_limiter: LoginRateLimiter,
        session_service: SessionService,
    ) -> None:
        self._password_service = password_service
        self._jwt_service = jwt_service
        self._rate_limiter = rate_limiter
        self._session_service = session_service

    async def login(
        self,
        session: AsyncSession,
        credentials: LoginRequest,
        *,
        client_ip: str,
    ) -> AuthResult:
        if credentials.student_id:
            identifier = normalize_student_id(credentials.student_id)
            user_query = User.student_id == identifier
        else:
            identifier = normalize_email(str(credentials.email))
            user_query = User.email == identifier

        rate_key = self._rate_limiter.key(client_ip, identifier)
        retry_after = await self._rate_limiter.consume(rate_key)
        if retry_after is not None:
            raise ApiError(
                status_code=429,
                code="too_many_login_attempts",
                message="Too many login attempts. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

        user = await session.scalar(select(User).where(user_query))
        password_matches = self._password_service.verify(
            credentials.password.get_secret_value(),
            user.password_hash if user else None,
        )

        if user is None or not password_matches or not user.is_active:
            raise invalid_credentials_error()

        if user.email_verified_at is None:
            raise ApiError(
                status_code=403,
                code="email_verification_required",
                message="Verify your university email before signing in.",
            )

        refresh_session = await self._session_service.create(session, user)
        token = self._jwt_service.issue_access_token(user.id)
        await self._rate_limiter.reset(rate_key)
        return AuthResult(
            response=LoginResponse(
                access_token=token.token,
                expires_in=token.expires_in,
                user=AuthenticatedUser(id=user.id, student_id=user.student_id, email=user.email),
            ),
            refresh_credential=refresh_session.credential,
            refresh_expires_at=refresh_session.expires_at,
        )

    async def refresh(
        self,
        session: AsyncSession,
        refresh_credential: str,
    ) -> AuthResult:
        refreshed = await self._session_service.refresh(
            session,
            refresh_credential,
        )
        access_token = self._jwt_service.issue_access_token(refreshed.user.id)
        return AuthResult(
            response=LoginResponse(
                access_token=access_token.token,
                expires_in=access_token.expires_in,
                user=AuthenticatedUser(
                    id=refreshed.user.id,
                    student_id=refreshed.user.student_id,
                    email=refreshed.user.email,
                ),
            ),
            refresh_credential=refreshed.credential,
            refresh_expires_at=refreshed.expires_at,
        )

    async def logout(
        self,
        session: AsyncSession,
        refresh_credential: str | None,
    ) -> None:
        if refresh_credential:
            await self._session_service.revoke(session, refresh_credential)
```

### backend/app/services/session.py

```python
import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models.auth_session import AuthSession
from app.models.user import User


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def invalid_refresh_session_error() -> ApiError:
    return ApiError(
        status_code=401,
        code="invalid_refresh_session",
        message="The session is no longer valid. Please sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )


@dataclass(frozen=True, slots=True)
class CreatedRefreshSession:
    credential: str
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class RefreshedSession:
    user: User
    credential: str | None
    expires_at: datetime


class SessionService:
    def __init__(
        self,
        *,
        expires_days: int,
        rotation_grace_seconds: int,
    ) -> None:
        self._expires_days = expires_days
        self._rotation_grace = timedelta(seconds=rotation_grace_seconds)

    async def create(
        self,
        session: AsyncSession,
        user: User,
    ) -> CreatedRefreshSession:
        now = utc_now()
        credential = secrets.token_urlsafe(48)
        expires_at = now + timedelta(days=self._expires_days)
        session.add(
            AuthSession(
                user_id=user.id,
                family_id=uuid.uuid4(),
                token_hash=hash_refresh_token(credential),
                expires_at=expires_at,
                created_at=now,
            )
        )
        await session.commit()
        return CreatedRefreshSession(
            credential=credential,
            expires_at=expires_at,
        )

    async def refresh(
        self,
        session: AsyncSession,
        credential: str,
    ) -> RefreshedSession:
        now = utc_now()
        auth_session = await session.scalar(
            select(AuthSession)
            .where(AuthSession.token_hash == hash_refresh_token(credential))
            .with_for_update()
        )
        if auth_session is None:
            raise invalid_refresh_session_error()

        expires_at = as_utc(auth_session.expires_at)
        if expires_at <= now:
            await self._revoke_family(session, auth_session.family_id, now)
            await session.commit()
            raise invalid_refresh_session_error()

        user = await session.get(User, auth_session.user_id)
        if user is None or not user.is_active or user.email_verified_at is None:
            await self._revoke_family(session, auth_session.family_id, now)
            await session.commit()
            raise invalid_refresh_session_error()

        if auth_session.revoked_at is not None:
            return await self._handle_rotated_credential(
                session,
                auth_session,
                user,
                now,
                expires_at,
            )

        next_credential = secrets.token_urlsafe(48)
        next_session = AuthSession(
            id=uuid.uuid4(),
            user_id=auth_session.user_id,
            family_id=auth_session.family_id,
            token_hash=hash_refresh_token(next_credential),
            expires_at=expires_at,
            created_at=now,
        )
        auth_session.revoked_at = now
        auth_session.replaced_by_session_id = next_session.id
        auth_session.last_used_at = now
        session.add(next_session)
        await session.commit()

        return RefreshedSession(
            user=user,
            credential=next_credential,
            expires_at=expires_at,
        )

    async def revoke(
        self,
        session: AsyncSession,
        credential: str,
    ) -> None:
        auth_session = await session.scalar(
            select(AuthSession)
            .where(AuthSession.token_hash == hash_refresh_token(credential))
            .with_for_update()
        )
        if auth_session is None:
            return

        await self._revoke_family(session, auth_session.family_id, utc_now())
        await session.commit()

    async def revoke_all_for_user(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        *,
        revoked_at: datetime | None = None,
    ) -> None:
        await session.execute(
            update(AuthSession)
            .where(
                AuthSession.user_id == user_id,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=revoked_at or utc_now())
        )

    async def _handle_rotated_credential(
        self,
        session: AsyncSession,
        auth_session: AuthSession,
        user: User,
        now: datetime,
        expires_at: datetime,
    ) -> RefreshedSession:
        revoked_at = as_utc(auth_session.revoked_at)  # type: ignore[arg-type]
        active_successor = await session.scalar(
            select(AuthSession.id).where(
                AuthSession.family_id == auth_session.family_id,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > now,
            )
        )
        if (
            auth_session.replaced_by_session_id is not None
            and now <= revoked_at + self._rotation_grace
            and active_successor is not None
        ):
            return RefreshedSession(
                user=user,
                credential=None,
                expires_at=expires_at,
            )

        if auth_session.replaced_by_session_id is not None:
            auth_session.reuse_detected_at = now
            await self._revoke_family(session, auth_session.family_id, now)
            await session.commit()

        raise invalid_refresh_session_error()

    async def _revoke_family(
        self,
        session: AsyncSession,
        family_id: uuid.UUID,
        revoked_at: datetime,
    ) -> None:
        await session.execute(
            update(AuthSession)
            .where(
                AuthSession.family_id == family_id,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=revoked_at)
        )
```

### backend/app/services/jwt.py

```python
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
```

---

## 11. Registration, email verification, and password reset

### backend/app/services/registration.py

```python
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models.user import User
from app.services.email import EmailSender
from app.services.identity import normalize_email, normalize_student_id
from app.services.one_time_token import OneTimeTokenService
from app.services.password import PasswordPolicyError, PasswordService
from app.services.rate_limit import EmailVerificationRateLimiter


logger = logging.getLogger(__name__)

REGISTER_MESSAGE = "Account created. We sent a verification code to your university email."
VERIFY_MESSAGE = "Your university email is verified. You can now sign in."
RESEND_MESSAGE = "If the account is eligible, a new verification code will be sent."


@dataclass(frozen=True, slots=True)
class VerificationDelivery:
    recipient: str
    code: str
    expires_minutes: int


class RegistrationService:
    def __init__(
        self,
        *,
        password_service: PasswordService,
        token_service: OneTimeTokenService,
        email_sender: EmailSender,
        rate_limiter: EmailVerificationRateLimiter,
        allowed_domains: set[str],
        verification_expire_minutes: int,
    ) -> None:
        self._password_service = password_service
        self._token_service = token_service
        self._email_sender = email_sender
        self._rate_limiter = rate_limiter
        self._allowed_domains = allowed_domains
        self._verification_expire_minutes = verification_expire_minutes

    def _validate_student_email(self, email: str) -> str:
        normalized = normalize_email(email)
        domain = normalized.rsplit("@", 1)[-1] if "@" in normalized else ""
        if domain not in self._allowed_domains:
            raise ApiError(
                status_code=422,
                code="student_email_domain_not_allowed",
                message="Use an approved university email address.",
            )
        return normalized

    async def register(
        self,
        session: AsyncSession,
        *,
        student_id: str,
        email: str,
        password: str,
    ) -> tuple[User, VerificationDelivery]:
        normalized_student_id = normalize_student_id(student_id)
        normalized_email = self._validate_student_email(email)
        try:
            self._password_service.validate_new_password(password)
        except PasswordPolicyError as exc:
            raise ApiError(
                status_code=422,
                code="password_policy_failed",
                message=str(exc),
            ) from exc

        existing = await session.scalar(
            select(User).where(
                or_(
                    User.student_id == normalized_student_id,
                    User.email == normalized_email,
                )
            )
        )
        if existing is not None:
            raise ApiError(
                status_code=409,
                code="account_already_exists",
                message="An account with these student details already exists.",
            )

        user = User(
            student_id=normalized_student_id,
            email=normalized_email,
            password_hash=self._password_service.hash(password),
            email_verified_at=None,
            is_active=True,
        )
        session.add(user)
        try:
            await session.flush()
            issued = await self._token_service.issue_email_verification(
                session,
                user,
                commit=False,
            )
            await session.commit()
            await session.refresh(user)
        except IntegrityError as exc:
            await session.rollback()
            raise ApiError(
                status_code=409,
                code="account_already_exists",
                message="An account with these student details already exists.",
            ) from exc
        except Exception:
            await session.rollback()
            raise

        await self._rate_limiter.acquire_resend_cooldown(normalized_student_id)

        return user, VerificationDelivery(
            recipient=user.email,
            code=issued.credential,
            expires_minutes=self._verification_expire_minutes,
        )

    async def verify_email(
        self,
        session: AsyncSession,
        *,
        student_id: str,
        code: str,
        client_ip: str,
    ) -> None:
        normalized_student_id = normalize_student_id(student_id)
        retry_after = await self._rate_limiter.consume_attempt(
            client_ip=client_ip,
            student_id=normalized_student_id,
        )
        if retry_after is not None:
            raise ApiError(
                status_code=429,
                code="too_many_verification_attempts",
                message="Too many verification attempts. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

        user = await session.scalar(
            select(User)
            .where(User.student_id == normalized_student_id, User.is_active.is_(True))
            .with_for_update()
        )
        if user is None or user.email_verified_at is not None:
            await session.rollback()
            raise self._invalid_code_error()

        token = await self._token_service.lock_active_email_verification(
            session,
            user,
            code,
        )
        if token is None:
            await session.commit()
            raise self._invalid_code_error()

        verified_at = datetime.now(timezone.utc)
        try:
            user.email_verified_at = verified_at
            user.updated_at = verified_at
            await self._token_service.consume_email_verification(
                session,
                token,
                consumed_at=verified_at,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

        await self._rate_limiter.reset_attempts(
            client_ip=client_ip,
            student_id=normalized_student_id,
        )

    async def request_resend(
        self,
        session: AsyncSession,
        *,
        student_id: str,
    ) -> VerificationDelivery | None:
        normalized_student_id = normalize_student_id(student_id)
        if not await self._rate_limiter.acquire_resend_cooldown(normalized_student_id):
            return None

        user = await session.scalar(
            select(User).where(User.student_id == normalized_student_id)
        )
        if user is None or not user.is_active or user.email_verified_at is not None:
            return None

        issued = await self._token_service.issue_email_verification(session, user)
        return VerificationDelivery(
            recipient=user.email,
            code=issued.credential,
            expires_minutes=self._verification_expire_minutes,
        )

    async def deliver_verification_email(self, delivery: VerificationDelivery) -> None:
        try:
            await self._email_sender.send_email_verification(
                recipient=delivery.recipient,
                code=delivery.code,
                expires_minutes=delivery.expires_minutes,
            )
        except Exception:
            logger.exception("Verification email delivery failed")

    @staticmethod
    def _invalid_code_error() -> ApiError:
        return ApiError(
            status_code=400,
            code="invalid_verification_code",
            message="The verification code is invalid or has expired.",
        )
```

### backend/app/services/password_reset.py

```python
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models.user import User
from app.services.email import EmailSender
from app.services.identity import normalize_email
from app.services.one_time_token import OneTimeTokenService
from app.services.password import PasswordPolicyError, PasswordService
from app.services.rate_limit import PasswordResetRateLimiter
from app.services.session import SessionService


logger = logging.getLogger(__name__)


FORGOT_PASSWORD_MESSAGE = (
    "If an eligible account exists for that email, password reset instructions "
    "will be sent shortly."
)
RESET_PASSWORD_MESSAGE = "Your password has been reset. Sign in with your new password."


@dataclass(frozen=True, slots=True)
class PasswordResetDelivery:
    recipient: str
    reset_url: str
    expires_minutes: int


def invalid_reset_token_error() -> ApiError:
    return ApiError(
        status_code=400,
        code="invalid_password_reset_token",
        message="This password reset link is invalid or has expired.",
    )


class PasswordResetService:
    def __init__(
        self,
        *,
        token_service: OneTimeTokenService,
        email_sender: EmailSender,
        rate_limiter: PasswordResetRateLimiter,
        frontend_base_url: str,
        token_expire_minutes: int,
        password_service: PasswordService,
        session_service: SessionService,
    ) -> None:
        self._token_service = token_service
        self._email_sender = email_sender
        self._rate_limiter = rate_limiter
        self._frontend_base_url = frontend_base_url.rstrip("/")
        self._token_expire_minutes = token_expire_minutes
        self._password_service = password_service
        self._session_service = session_service

    async def request_reset(
        self,
        session: AsyncSession,
        email: str,
        *,
        client_ip: str,
    ) -> PasswordResetDelivery | None:
        normalized_email = normalize_email(email)
        await self._rate_limiter.check_ip(client_ip)

        if not await self._rate_limiter.acquire_email_cooldown(normalized_email):
            return None

        user = await session.scalar(select(User).where(User.email == normalized_email))
        if user is None or not user.is_active:
            return None

        issued = await self._token_service.issue_password_reset(session, user)
        return PasswordResetDelivery(
            recipient=user.email,
            reset_url=self._build_reset_url(issued.credential),
            expires_minutes=self._token_expire_minutes,
        )

    async def reset_password(
        self,
        session: AsyncSession,
        *,
        credential: str,
        new_password: str,
    ) -> None:
        try:
            self._password_service.validate_new_password(new_password)
        except PasswordPolicyError as exc:
            raise ApiError(
                status_code=422,
                code="password_policy_failed",
                message=str(exc),
            ) from exc

        token = await self._token_service.lock_active_password_reset(
            session,
            credential,
        )
        if token is None:
            await session.rollback()
            raise invalid_reset_token_error()

        user = await session.scalar(
            select(User)
            .where(User.id == token.user_id, User.is_active.is_(True))
            .with_for_update()
        )
        if user is None:
            await session.rollback()
            raise invalid_reset_token_error()

        if self._password_service.verify(new_password, user.password_hash):
            await session.rollback()
            raise ApiError(
                status_code=422,
                code="password_reuse_not_allowed",
                message="Choose a password different from your current password.",
            )

        changed_at = datetime.now(timezone.utc)
        try:
            new_hash = self._password_service.hash(new_password)
            user.password_hash = new_hash
            user.updated_at = changed_at
            await self._token_service.consume_password_reset(
                session,
                token,
                consumed_at=changed_at,
            )
            await self._session_service.revoke_all_for_user(
                session,
                user.id,
                revoked_at=changed_at,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    async def deliver_reset_email(self, delivery: PasswordResetDelivery) -> None:
        try:
            await self._email_sender.send_password_reset(
                recipient=delivery.recipient,
                reset_url=delivery.reset_url,
                expires_minutes=delivery.expires_minutes,
            )
        except Exception:
            logger.exception("Password reset email delivery failed")

    def _build_reset_url(self, credential: str) -> str:
        query = urlencode({"token": credential})
        return f"{self._frontend_base_url}/reset-password?{query}"
```

---

## 12. Token management and security utilities

### backend/app/services/one_time_token.py

```python
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth_one_time_token import (
    AuthOneTimeToken,
    EMAIL_VERIFICATION_PURPOSE,
    PASSWORD_RESET_PURPOSE,
)
from app.models.user import User


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def hash_one_time_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_verification_code(*, user_id: object, code: str, pepper: bytes) -> str:
    message = f"{user_id}:{code}".encode("utf-8")
    return hmac.new(pepper, message, hashlib.sha256).hexdigest()


@dataclass(frozen=True, slots=True)
class IssuedOneTimeToken:
    credential: str
    expires_at: datetime


class OneTimeTokenService:
    def __init__(
        self,
        *,
        password_reset_expire_minutes: int,
        email_verification_expire_minutes: int = 10,
        verification_pepper: str = "development-only-verification-pepper",
        verification_max_attempts: int = 6,
    ) -> None:
        self._password_reset_expire_minutes = password_reset_expire_minutes
        self._email_verification_expire_minutes = email_verification_expire_minutes
        self._verification_pepper = verification_pepper.encode("utf-8")
        self._verification_max_attempts = verification_max_attempts

    async def issue_password_reset(
        self,
        session: AsyncSession,
        user: User,
        *,
        now: datetime | None = None,
    ) -> IssuedOneTimeToken:
        issued_at = now or utc_now()
        expires_at = issued_at + timedelta(
            minutes=self._password_reset_expire_minutes
        )

        await session.execute(
            update(AuthOneTimeToken)
            .where(
                AuthOneTimeToken.user_id == user.id,
                AuthOneTimeToken.purpose == PASSWORD_RESET_PURPOSE,
                AuthOneTimeToken.consumed_at.is_(None),
                AuthOneTimeToken.invalidated_at.is_(None),
            )
            .values(invalidated_at=issued_at)
        )

        credential = secrets.token_urlsafe(48)
        session.add(
            AuthOneTimeToken(
                user_id=user.id,
                purpose=PASSWORD_RESET_PURPOSE,
                token_hash=hash_one_time_token(credential),
                expires_at=expires_at,
                created_at=issued_at,
            )
        )
        await session.commit()
        return IssuedOneTimeToken(
            credential=credential,
            expires_at=expires_at,
        )

    async def issue_email_verification(
        self,
        session: AsyncSession,
        user: User,
        *,
        now: datetime | None = None,
        commit: bool = True,
    ) -> IssuedOneTimeToken:
        issued_at = now or utc_now()
        expires_at = issued_at + timedelta(
            minutes=self._email_verification_expire_minutes
        )

        await session.execute(
            update(AuthOneTimeToken)
            .where(
                AuthOneTimeToken.user_id == user.id,
                AuthOneTimeToken.purpose == EMAIL_VERIFICATION_PURPOSE,
                AuthOneTimeToken.consumed_at.is_(None),
                AuthOneTimeToken.invalidated_at.is_(None),
            )
            .values(invalidated_at=issued_at)
        )

        code = f"{secrets.randbelow(1_000_000):06d}"
        session.add(
            AuthOneTimeToken(
                user_id=user.id,
                purpose=EMAIL_VERIFICATION_PURPOSE,
                token_hash=hash_verification_code(
                    user_id=user.id,
                    code=code,
                    pepper=self._verification_pepper,
                ),
                expires_at=expires_at,
                created_at=issued_at,
            )
        )
        if commit:
            await session.commit()
        return IssuedOneTimeToken(credential=code, expires_at=expires_at)

    async def lock_active_email_verification(
        self,
        session: AsyncSession,
        user: User,
        code: str,
        *,
        now: datetime | None = None,
    ) -> AuthOneTimeToken | None:
        checked_at = now or utc_now()
        token = await session.scalar(
            select(AuthOneTimeToken)
            .where(
                AuthOneTimeToken.user_id == user.id,
                AuthOneTimeToken.purpose == EMAIL_VERIFICATION_PURPOSE,
                AuthOneTimeToken.consumed_at.is_(None),
                AuthOneTimeToken.invalidated_at.is_(None),
            )
            .order_by(AuthOneTimeToken.created_at.desc())
            .with_for_update()
        )
        if token is None or as_utc(token.expires_at) <= checked_at:
            return None

        if token.attempt_count >= self._verification_max_attempts:
            token.invalidated_at = checked_at
            return None

        candidate_hash = hash_verification_code(
            user_id=user.id,
            code=code,
            pepper=self._verification_pepper,
        )
        if not hmac.compare_digest(token.token_hash, candidate_hash):
            token.attempt_count += 1
            if token.attempt_count >= self._verification_max_attempts:
                token.invalidated_at = checked_at
            return None

        return token

    async def consume_email_verification(
        self,
        session: AsyncSession,
        token: AuthOneTimeToken,
        *,
        consumed_at: datetime,
    ) -> None:
        token.consumed_at = consumed_at
        await session.execute(
            update(AuthOneTimeToken)
            .where(
                AuthOneTimeToken.user_id == token.user_id,
                AuthOneTimeToken.purpose == EMAIL_VERIFICATION_PURPOSE,
                AuthOneTimeToken.id != token.id,
                AuthOneTimeToken.consumed_at.is_(None),
                AuthOneTimeToken.invalidated_at.is_(None),
            )
            .values(invalidated_at=consumed_at)
        )

    async def lock_active_password_reset(
        self,
        session: AsyncSession,
        credential: str,
        *,
        now: datetime | None = None,
    ) -> AuthOneTimeToken | None:
        checked_at = now or utc_now()
        token = await session.scalar(
            select(AuthOneTimeToken)
            .where(
                AuthOneTimeToken.token_hash == hash_one_time_token(credential),
                AuthOneTimeToken.purpose == PASSWORD_RESET_PURPOSE,
                AuthOneTimeToken.consumed_at.is_(None),
                AuthOneTimeToken.invalidated_at.is_(None),
            )
            .with_for_update()
        )
        if token is None or as_utc(token.expires_at) <= checked_at:
            return None
        return token

    async def consume_password_reset(
        self,
        session: AsyncSession,
        token: AuthOneTimeToken,
        *,
        consumed_at: datetime,
    ) -> None:
        token.consumed_at = consumed_at
        await session.execute(
            update(AuthOneTimeToken)
            .where(
                AuthOneTimeToken.user_id == token.user_id,
                AuthOneTimeToken.purpose == PASSWORD_RESET_PURPOSE,
                AuthOneTimeToken.id != token.id,
                AuthOneTimeToken.consumed_at.is_(None),
                AuthOneTimeToken.invalidated_at.is_(None),
            )
            .values(invalidated_at=consumed_at)
        )
```

### backend/app/services/password.py

```python
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError


MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128


class PasswordPolicyError(ValueError):
    pass


class PasswordService:
    def __init__(self) -> None:
        self._password_hash = PasswordHash.recommended()
        self._dummy_hash = self._password_hash.hash("uniswap-dummy-password")

    def validate_new_password(self, password: str) -> None:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise PasswordPolicyError(
                f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
            )
        if len(password) > MAX_PASSWORD_LENGTH:
            raise PasswordPolicyError(
                f"Password must be at most {MAX_PASSWORD_LENGTH} characters."
            )
        if not password.strip():
            raise PasswordPolicyError("Password cannot contain only whitespace.")

    def hash(self, password: str) -> str:
        self.validate_new_password(password)
        return self._password_hash.hash(password)

    def verify(self, password: str, password_hash: str | None) -> bool:
        candidate_hash = password_hash or self._dummy_hash
        try:
            verified = self._password_hash.verify(password, candidate_hash)
        except (TypeError, ValueError, UnknownHashError):
            verified = False
        return bool(password_hash) and verified
```

### backend/app/services/identity.py

```python
import re


STUDENT_ID_PATTERN = re.compile(r"^ITBIN\d{8}$")


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def normalize_student_id(student_id: str) -> str:
    return student_id.strip().upper()


def is_valid_student_id(student_id: str) -> bool:
    return bool(STUDENT_ID_PATTERN.fullmatch(normalize_student_id(student_id)))
```

### backend/app/services/email.py

```python
import asyncio
import smtplib
from email.message import EmailMessage
from typing import Protocol


class EmailSender(Protocol):
    async def send_email_verification(
        self,
        *,
        recipient: str,
        code: str,
        expires_minutes: int,
    ) -> None: ...

    async def send_password_reset(
        self,
        *,
        recipient: str,
        reset_url: str,
        expires_minutes: int,
    ) -> None: ...


class SmtpEmailSender:
    def __init__(
        self,
        *,
        mail_from: str,
        smtp_host: str,
        smtp_port: int,
        smtp_username: str | None,
        smtp_password: str | None,
        use_starttls: bool,
        timeout_seconds: float = 10.0,
    ) -> None:
        self._mail_from = mail_from
        self._smtp_host = smtp_host
        self._smtp_port = smtp_port
        self._smtp_username = smtp_username
        self._smtp_password = smtp_password
        self._use_starttls = use_starttls
        self._timeout_seconds = timeout_seconds

    async def send_email_verification(
        self,
        *,
        recipient: str,
        code: str,
        expires_minutes: int,
    ) -> None:
        message = EmailMessage()
        message["From"] = self._mail_from
        message["To"] = recipient
        message["Subject"] = f"{code} is your UniSwap verification code"
        message.set_content(
            "Welcome to UniSwap. Verify your university email to activate your student account.\n\n"
            f"Verification code: {code}\n\n"
            f"This code expires in {expires_minutes} minutes and can be used once.\n"
            "If you did not create this account, you can ignore this email."
        )
        await asyncio.to_thread(self._send_message, message)

    async def send_password_reset(
        self,
        *,
        recipient: str,
        reset_url: str,
        expires_minutes: int,
    ) -> None:
        message = EmailMessage()
        message["From"] = self._mail_from
        message["To"] = recipient
        message["Subject"] = "Reset your UniSwap password"
        message.set_content(
            "We received a request to reset your UniSwap password.\n\n"
            f"Open this link to continue: {reset_url}\n\n"
            f"This link expires in {expires_minutes} minutes and can be used once.\n"
            "If you did not request a reset, you can ignore this email."
        )
        await asyncio.to_thread(self._send_message, message)

    def _send_message(self, message: EmailMessage) -> None:
        with smtplib.SMTP(
            self._smtp_host,
            self._smtp_port,
            timeout=self._timeout_seconds,
        ) as smtp:
            if self._use_starttls:
                smtp.starttls()
            if self._smtp_username:
                smtp.login(self._smtp_username, self._smtp_password or "")
            smtp.send_message(message)
```

### backend/app/services/rate_limit.py

```python
import asyncio
import hashlib
import time
from collections import defaultdict, deque

from app.errors import ApiError


class LoginRateLimiter:
    def __init__(self, *, attempts: int, window_seconds: int) -> None:
        self._attempts = attempts
        self._window_seconds = window_seconds
        self._attempt_log: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    @staticmethod
    def key(client_ip: str, normalized_identifier: str) -> str:
        material = f"{client_ip}:{normalized_identifier}".encode()
        return hashlib.sha256(material).hexdigest()

    async def consume(self, key: str, *, now: float | None = None) -> int | None:
        current_time = time.monotonic() if now is None else now
        cutoff = current_time - self._window_seconds

        async with self._lock:
            attempts = self._attempt_log[key]
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()

            if len(attempts) >= self._attempts:
                return max(1, int(self._window_seconds - (current_time - attempts[0])))

            attempts.append(current_time)
            return None

    async def reset(self, key: str) -> None:
        async with self._lock:
            self._attempt_log.pop(key, None)


class PasswordResetRateLimiter:
    def __init__(
        self,
        *,
        attempts: int,
        window_seconds: int,
        email_cooldown_seconds: int,
    ) -> None:
        self._attempts = attempts
        self._window_seconds = window_seconds
        self._email_cooldown_seconds = email_cooldown_seconds
        self._ip_attempts: dict[str, deque[float]] = defaultdict(deque)
        self._email_last_request: dict[str, float] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    async def check_ip(self, client_ip: str, *, now: float | None = None) -> None:
        current_time = time.monotonic() if now is None else now
        cutoff = current_time - self._window_seconds
        key = self._hash(client_ip)

        async with self._lock:
            attempts = self._ip_attempts[key]
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()

            if len(attempts) >= self._attempts:
                retry_after = max(
                    1,
                    int(self._window_seconds - (current_time - attempts[0])),
                )
                raise ApiError(
                    status_code=429,
                    code="too_many_password_reset_requests",
                    message="Too many password reset requests. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )

            attempts.append(current_time)

    async def acquire_email_cooldown(
        self,
        normalized_email: str,
        *,
        now: float | None = None,
    ) -> bool:
        current_time = time.monotonic() if now is None else now
        key = self._hash(normalized_email)

        async with self._lock:
            previous = self._email_last_request.get(key)
            if (
                previous is not None
                and current_time - previous < self._email_cooldown_seconds
            ):
                return False

            self._email_last_request[key] = current_time
            return True


class EmailVerificationRateLimiter:
    def __init__(
        self,
        *,
        attempts: int,
        window_seconds: int,
        resend_cooldown_seconds: int,
    ) -> None:
        self._attempts = attempts
        self._window_seconds = window_seconds
        self._resend_cooldown_seconds = resend_cooldown_seconds
        self._attempt_log: dict[str, deque[float]] = defaultdict(deque)
        self._resend_last: dict[str, float] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    async def consume_attempt(
        self,
        *,
        client_ip: str,
        student_id: str,
        now: float | None = None,
    ) -> int | None:
        current_time = time.monotonic() if now is None else now
        cutoff = current_time - self._window_seconds
        key = self._hash(f"{client_ip}:{student_id}")
        async with self._lock:
            attempts = self._attempt_log[key]
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()
            if len(attempts) >= self._attempts:
                return max(1, int(self._window_seconds - (current_time - attempts[0])))
            attempts.append(current_time)
            return None

    async def reset_attempts(self, *, client_ip: str, student_id: str) -> None:
        key = self._hash(f"{client_ip}:{student_id}")
        async with self._lock:
            self._attempt_log.pop(key, None)

    async def acquire_resend_cooldown(
        self,
        student_id: str,
        *,
        now: float | None = None,
    ) -> bool:
        current_time = time.monotonic() if now is None else now
        key = self._hash(student_id)
        async with self._lock:
            previous = self._resend_last.get(key)
            if previous is not None and current_time - previous < self._resend_cooldown_seconds:
                return False
            self._resend_last[key] = current_time
            return True
```

---

## 13. Summary of backend capabilities

The UniSwap backend currently implements the following secure authentication and account flow:

- Student registration with validation of university email and student ID
- Email verification using one-time codes stored securely in the database
- Rate limiting for login attempts, verification attempts, and password reset requests
- Secure password hashing with Argon2 via `pwdlib`
- JWT access token issuance and validation
- Refresh token session rotation and revocation
- Password reset flow with one-time token links
- CORS-enabled FastAPI app with custom JSON error responses
- Async SQLAlchemy integration with PostgreSQL-compatible database URLs

This is the core backend code used to power user authentication and account-management logic for the project.
