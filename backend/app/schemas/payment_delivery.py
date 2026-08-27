import uuid
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class CheckoutRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Total order amount")
    payment_method: Literal["stripe", "cash_on_meetup"]
    delivery_method: Literal["meetup", "shipping"]
    meetup_location: str | None = Field(None, max_length=255)
    meetup_time: datetime | None = None


class CheckoutResponse(BaseModel):
    order_id: uuid.UUID
    payment_id: uuid.UUID
    delivery_id: uuid.UUID
    payment_url: str | None = None
    amount: float
    status: str


class PaymentConfirmRequest(BaseModel):
    success: bool = True


class PaymentConfirmResponse(BaseModel):
    payment_id: uuid.UUID
    status: str


class RefundRequest(BaseModel):
    reason: str | None = Field(None, max_length=255)


class RefundResponse(BaseModel):
    payment_id: uuid.UUID
    status: str


class ScheduleMeetupRequest(BaseModel):
    meetup_location: str = Field(..., min_length=1, max_length=255)
    meetup_time: datetime


class DeliveryTrackingResponse(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    delivery_method: str
    status: str
    tracking_number: str | None = None
    meetup_location: str | None = None
    meetup_time: datetime | None = None
    verification_code: str
    created_at: datetime
    updated_at: datetime


class VerifyQRRequest(BaseModel):
    verification_code: str = Field(..., min_length=6, max_length=6)


class VerifyQRResponse(BaseModel):
    success: bool
    status: str
