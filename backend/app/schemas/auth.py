import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, SecretStr, field_validator, model_validator

from app.services.identity import is_valid_student_id, normalize_student_id


class LoginRequest(BaseModel):
    # Student ID is the canonical login identifier for the new UI. `email`
    # remains accepted for compatibility with identities created before this
    # ticket and existing API clients/tests.
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
