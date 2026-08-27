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
