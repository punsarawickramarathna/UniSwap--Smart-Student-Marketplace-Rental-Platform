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
    password_reset_service: PasswordResetService = Depends(
        get_password_reset_service
    ),
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
    responses={
        400: {"description": "Invalid, expired, or already-used reset token"},
        422: {"description": "New password does not meet policy"},
    },
)
async def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
    password_reset_service: PasswordResetService = Depends(
        get_password_reset_service
    ),
) -> ResetPasswordResponse:
    await password_reset_service.reset_password(
        session,
        credential=payload.token.get_secret_value(),
        new_password=payload.new_password.get_secret_value(),
    )
    clear_refresh_cookie(response, request.app.state.settings)
    return ResetPasswordResponse(message=RESET_PASSWORD_MESSAGE)


@router.post(
    "/refresh",
    response_model=LoginResponse,
    response_model_exclude_none=True,
    responses={
        401: {"description": "Refresh session expired, revoked, or invalid"},
        403: {"description": "CSRF protection header required"},
    },
)
async def refresh_session(
    request: Request,
    response: Response,
    _: Annotated[None, Depends(require_csrf_protection)],
    session: AsyncSession = Depends(get_session),
    auth_service: AuthService = Depends(get_auth_service),
) -> LoginResponse:
    settings: Settings = request.app.state.settings
    refresh_credential = request.cookies.get(settings.refresh_cookie_name)
    if not refresh_credential:
        raise invalid_refresh_session_error()

    result = await auth_service.refresh(session, refresh_credential)
    set_refresh_cookie(response, result, settings)
    return result.response


@router.post(
    "/logout",
    status_code=204,
    responses={403: {"description": "CSRF protection header required"}},
)
async def logout(
    request: Request,
    response: Response,
    _: Annotated[None, Depends(require_csrf_protection)],
    session: AsyncSession = Depends(get_session),
    auth_service: AuthService = Depends(get_auth_service),
) -> None:
    settings: Settings = request.app.state.settings
    await auth_service.logout(
        session,
        request.cookies.get(settings.refresh_cookie_name),
    )
    clear_refresh_cookie(response, settings)


@router.get(
    "/me",
    response_model=AuthenticatedUser,
    response_model_exclude_none=True,
    responses={401: {"description": "A valid access token is required"}},
)
async def get_authenticated_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=current_user.id,
        student_id=current_user.student_id,
        email=current_user.email,
    )
