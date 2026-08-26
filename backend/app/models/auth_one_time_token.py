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
