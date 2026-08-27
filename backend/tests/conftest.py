import os
from collections.abc import AsyncIterator

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-that-is-at-least-32-characters")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import Settings
from app.database import Base, create_session_factory
from app.main import create_app

class RecordingEmailSender:
    def __init__(self) -> None:
        self.password_reset_messages: list[dict[str, object]] = []
        self.verification_messages: list[dict[str, object]] = []
        self.fail_password_reset = False
        self.fail_verification = False

    async def send_email_verification(
        self,
        *,
        recipient: str,
        code: str,
        expires_minutes: int,
    ) -> None:
        if self.fail_verification:
            raise RuntimeError("simulated verification provider failure")
        self.verification_messages.append(
            {
                "recipient": recipient,
                "code": code,
                "expires_minutes": expires_minutes,
            }
        )

    async def send_password_reset(
        self,
        *,
        recipient: str,
        reset_url: str,
        expires_minutes: int,
    ) -> None:
        if self.fail_password_reset:
            raise RuntimeError("simulated email provider failure")
        self.password_reset_messages.append(
            {
                "recipient": recipient,
                "reset_url": reset_url,
                "expires_minutes": expires_minutes,
            }
        )

@pytest_asyncio.fixture
async def app_context():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    session_factory = create_session_factory(engine)
    settings = Settings(
        app_env="test",
        database_url="sqlite+aiosqlite://",
        jwt_secret_key="test-secret-key-that-is-at-least-32-characters",
        login_rate_limit_attempts=5,
        login_rate_limit_window_seconds=60,
        allowed_student_email_domains="campus.edu",
        email_verification_token_expire_minutes=10,
        email_verification_attempts=6,
        email_verification_window_seconds=600,
        email_verification_resend_cooldown_seconds=60,
    )
    email_sender = RecordingEmailSender()
    app = create_app(
        settings=settings,
        session_factory=session_factory,
        email_sender=email_sender,
    )

    yield app, session_factory
    await engine.dispose()

@pytest_asyncio.fixture
async def client(app_context) -> AsyncIterator[AsyncClient]:
    app, _ = app_context
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client
