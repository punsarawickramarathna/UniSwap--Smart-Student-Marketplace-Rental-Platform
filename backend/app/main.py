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
