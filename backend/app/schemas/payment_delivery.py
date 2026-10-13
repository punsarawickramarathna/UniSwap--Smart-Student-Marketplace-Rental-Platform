import uuid
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class CheckoutRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Total order amount")
    payment_method: Literal["stripe", "cash_on_meetup"]
    delivery_method: Literal["meetup", "shipping"]
    seller_id: uuid.UUID | None = None
    item_title: str | None = Field(None, max_length=255)
    quantity: int = Field(1, ge=1)
    meetup_location: str | None = Field(None, max_length=255)
    meetup_time: datetime | None = None
    shipping_address: str | None = Field(None, max_length=500)


class CheckoutResponse(BaseModel):
    order_id: uuid.UUID
    payment_id: uuid.UUID
    delivery_id: uuid.UUID
    seller_id: uuid.UUID | None = None
    item_title: str | None = None
    payment_url: str | None = None
    amount: float
    currency: str = "LKR"
    status: str


class PaymentConfirmRequest(BaseModel):
    success: bool = True


class PaymentConfirmResponse(BaseModel):
    payment_id: uuid.UUID
    status: str
    transaction_reference: str | None = None
    receipt_url: str | None = None


class RefundRequest(BaseModel):
    reason: str | None = Field(None, max_length=255)


class RefundResponse(BaseModel):
    payment_id: uuid.UUID
    status: str


class ScheduleMeetupRequest(BaseModel):
    meetup_location: str = Field(..., min_length=1, max_length=255)
    meetup_time: datetime


class ShippingStatusUpdateRequest(BaseModel):
    status: Literal["processing", "shipped", "in_transit", "delivered", "cancelled"]
    carrier: str | None = Field(None, max_length=100)
    tracking_number: str | None = Field(None, max_length=255)


class DeliveryTrackingResponse(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    user_id: uuid.UUID
    seller_id: uuid.UUID | None = None
    is_buyer: bool = True
    delivery_method: str
    status: str
    tracking_number: str | None = None
    carrier: str | None = None
    shipping_address: str | None = None
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
    message: str | None = None


class InvoiceResponse(BaseModel):
    invoice_id: str
    order_id: uuid.UUID
    payment_id: uuid.UUID
    issue_date: datetime
    buyer_id: uuid.UUID
    buyer_email: str | None = None
    seller_id: uuid.UUID | None = None
    seller_email: str | None = None
    item_title: str
    quantity: int
    amount: float
    currency: str
    payment_method: str
    payment_status: str
    delivery_method: str
    delivery_status: str
    transaction_reference: str | None = None
