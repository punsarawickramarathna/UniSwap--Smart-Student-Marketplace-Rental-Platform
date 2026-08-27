import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user
from app.dependencies.database import get_session
from app.models.user import User
from app.schemas.payment_delivery import (
    CheckoutRequest,
    CheckoutResponse,
    DeliveryTrackingResponse,
    PaymentConfirmRequest,
    PaymentConfirmResponse,
    RefundRequest,
    RefundResponse,
    ScheduleMeetupRequest,
    VerifyQRRequest,
    VerifyQRResponse,
)
from app.services.payment_delivery import PaymentDeliveryService

router = APIRouter(prefix="/api/payment-delivery", tags=["payment-delivery"])


def get_payment_delivery_service(request: Request) -> PaymentDeliveryService:
    return request.app.state.payment_delivery_service


@router.post("/checkout", response_model=CheckoutResponse)
async def checkout(
    payload: CheckoutRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    service: PaymentDeliveryService = Depends(get_payment_delivery_service),
) -> CheckoutResponse:
    return await service.checkout(session, current_user.id, payload)


@router.post("/payments/{payment_id}/confirm", response_model=PaymentConfirmResponse)
async def confirm_payment(
    payment_id: uuid.UUID,
    payload: PaymentConfirmRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    service: PaymentDeliveryService = Depends(get_payment_delivery_service),
) -> PaymentConfirmResponse:
    return await service.confirm_payment(session, payment_id, current_user.id, payload.success)


@router.post("/payments/{payment_id}/refund", response_model=RefundResponse)
async def process_refund(
    payment_id: uuid.UUID,
    payload: RefundRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    service: PaymentDeliveryService = Depends(get_payment_delivery_service),
) -> RefundResponse:
    return await service.process_refund(session, payment_id, current_user.id)


@router.get("/payments/user", response_model=list[CheckoutResponse])
async def list_user_payments(
    current_user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    service: PaymentDeliveryService = Depends(get_payment_delivery_service),
) -> list[CheckoutResponse]:
    payments = await service.list_user_payments(session, current_user.id)
    return [
        CheckoutResponse(
            order_id=p.order_id,
            payment_id=p.id,
            delivery_id=p.order_id,  # Fallback since order_id maps 1-1 to delivery
            amount=float(p.amount),
            status=p.status,
        )
        for p in payments
    ]


@router.get("/deliveries/user", response_model=list[DeliveryTrackingResponse])
async def list_user_deliveries(
    current_user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    service: PaymentDeliveryService = Depends(get_payment_delivery_service),
) -> list[DeliveryTrackingResponse]:
    deliveries = await service.list_user_deliveries(session, current_user.id)
    return [
        DeliveryTrackingResponse(
            id=d.id,
            order_id=d.order_id,
            delivery_method=d.delivery_method,
            status=d.status,
            tracking_number=d.tracking_number,
            meetup_location=d.meetup_location,
            meetup_time=d.meetup_time,
            verification_code=d.verification_code,
            created_at=d.created_at,
            updated_at=d.updated_at,
        )
        for d in deliveries
    ]


@router.post("/deliveries/{delivery_id}/schedule", response_model=DeliveryTrackingResponse)
async def schedule_meetup(
    delivery_id: uuid.UUID,
    payload: ScheduleMeetupRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    service: PaymentDeliveryService = Depends(get_payment_delivery_service),
) -> DeliveryTrackingResponse:
    d = await service.schedule_meetup(session, delivery_id, current_user.id, payload)
    return DeliveryTrackingResponse(
        id=d.id,
        order_id=d.order_id,
        delivery_method=d.delivery_method,
        status=d.status,
        tracking_number=d.tracking_number,
        meetup_location=d.meetup_location,
        meetup_time=d.meetup_time,
        verification_code=d.verification_code,
        created_at=d.created_at,
        updated_at=d.updated_at,
    )


@router.get("/deliveries/{delivery_id}/tracking", response_model=DeliveryTrackingResponse)
async def get_delivery_tracking(
    delivery_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    service: PaymentDeliveryService = Depends(get_payment_delivery_service),
) -> DeliveryTrackingResponse:
    d = await service.get_delivery_tracking(session, delivery_id, current_user.id)
    return DeliveryTrackingResponse(
        id=d.id,
        order_id=d.order_id,
        delivery_method=d.delivery_method,
        status=d.status,
        tracking_number=d.tracking_number,
        meetup_location=d.meetup_location,
        meetup_time=d.meetup_time,
        verification_code=d.verification_code,
        created_at=d.created_at,
        updated_at=d.updated_at,
    )


@router.post("/deliveries/{delivery_id}/verify-qr", response_model=VerifyQRResponse)
async def verify_meetup_qr(
    delivery_id: uuid.UUID,
    payload: VerifyQRRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: AsyncSession = Depends(get_session),
    service: PaymentDeliveryService = Depends(get_payment_delivery_service),
) -> VerifyQRResponse:
    return await service.verify_meetup_qr(session, delivery_id, current_user.id, payload.verification_code)
