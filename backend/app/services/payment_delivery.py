import secrets
import string
import uuid
from typing import Literal
from datetime import datetime, timezone
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

try:
    import stripe
except ImportError:  # pragma: no cover
    stripe = None

from app.config import Settings, get_settings
from app.errors import ApiError
from app.models.order import Order
from app.models.payment import Payment
from app.models.delivery import Delivery
from app.models.user import User
from app.services.email import EmailSender
from app.schemas.payment_delivery import (
    CheckoutRequest,
    CheckoutResponse,
    DeliveryTrackingResponse,
    InvoiceResponse,
    PaymentConfirmResponse,
    RefundResponse,
    ScheduleMeetupRequest,
    ShippingStatusUpdateRequest,
    VerifyQRResponse,
)


class PaymentDeliveryService:
    def __init__(
        self,
        *,
        settings: Settings | None = None,
        email_sender: EmailSender | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._email_sender = email_sender

    def _generate_verification_code(self) -> str:
        chars = string.ascii_uppercase + string.digits
        return "".join(secrets.choice(chars) for _ in range(6))

    def _generate_tracking_number(self) -> str:
        digits = string.digits
        part1 = "".join(secrets.choice(digits) for _ in range(4))
        part2 = "".join(secrets.choice(digits) for _ in range(4))
        return f"TRK-{part1}-{part2}"

    async def checkout(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        request: CheckoutRequest,
        user_email: str | None = None,
    ) -> CheckoutResponse:
        item_title = request.item_title or "Campus Marketplace Order"

        # 1. Create Order
        order = Order(
            user_id=user_id,
            seller_id=request.seller_id,
            item_title=item_title,
            quantity=request.quantity,
            total_amount=request.amount,
            status="pending",
        )
        session.add(order)
        await session.flush()

        # 2. Create Payment record
        payment = Payment(
            order_id=order.id,
            user_id=user_id,
            seller_id=request.seller_id,
            payment_method=request.payment_method,
            amount=request.amount,
            currency=self._settings.payment_currency,
            status="pending",
        )
        session.add(payment)
        await session.flush()

        # 3. Create Delivery / Pickup schedule record
        tracking_num = None
        carrier = None
        if request.delivery_method == "shipping":
            tracking_num = self._generate_tracking_number()
            carrier = "Standard Campus Courier"

        verification_code = self._generate_verification_code()
        qr_hash = f"qr_{verification_code.lower()}"

        delivery = Delivery(
            order_id=order.id,
            user_id=user_id,
            seller_id=request.seller_id,
            delivery_method=request.delivery_method,
            status="scheduled",
            tracking_number=tracking_num,
            carrier=carrier,
            shipping_address=request.shipping_address,
            meetup_location=request.meetup_location,
            meetup_time=request.meetup_time,
            qr_code_hash=qr_hash,
            verification_code=verification_code,
        )
        session.add(delivery)
        await session.commit()

        # 4. Generate Stripe session or simulation
        payment_url = None
        if request.payment_method == "stripe":
            if (
                stripe is not None
                and self._settings.stripe_secret_key is not None
                and not self._settings.stripe_secret_key.get_secret_value().startswith("replace-")
                and not self._settings.stripe_secret_key.get_secret_value().startswith("sk_test_replace")
            ):
                try:
                    stripe.api_key = self._settings.stripe_secret_key.get_secret_value()
                    session_params = {
                        "payment_method_types": ["card"],
                        "line_items": [
                            {
                                "price_data": {
                                    "currency": self._settings.payment_currency.lower(),
                                    "product_data": {"name": item_title},
                                    "unit_amount": int(request.amount * 100),
                                },
                                "quantity": request.quantity,
                            }
                        ],
                        "mode": "payment",
                        "client_reference_id": str(payment.id),
                        "success_url": f"{self._settings.frontend_base_url}/payment-success?payment_id={payment.id}",
                        "cancel_url": f"{self._settings.frontend_base_url}/checkout?cancelled=1",
                    }
                    if user_email:
                        session_params["customer_email"] = user_email
                    stripe_session = stripe.checkout.Session.create(**session_params)
                    payment_url = stripe_session.url
                    payment.stripe_payment_intent_id = stripe_session.id
                    await session.commit()
                except Exception:
                    # Fallback to simulated checkout URL if Stripe API fails or unreachable
                    payment_url = f"/payment-success?payment_id={payment.id}"
            else:
                # Simulated checkout URL for testing/demo
                payment_url = f"/payment-success?payment_id={payment.id}"

        # 5. Send order placement email notification
        if self._email_sender and user_email:
            details_str = (
                f"Item: {item_title} (Qty: {request.quantity})\n"
                f"Amount: {request.amount:.2f} {self._settings.payment_currency}\n"
                f"Method: {request.delivery_method.title()}"
            )
            if request.delivery_method == "meetup":
                details_str += f"\nMeetup: {request.meetup_location} at {request.meetup_time}"
            elif request.delivery_method == "shipping":
                details_str += f"\nTracking: {tracking_num}"

            await self._email_sender.send_order_notification(
                recipient=user_email,
                subject=f"UniSwap Order Placed - #{str(order.id)[:8]}",
                message=(
                    f"Hi,\n\nYour order has been initiated on UniSwap.\n\n"
                    f"{details_str}\n\n"
                    f"Verification code for delivery: {verification_code}\n\n"
                    "Thank you for using UniSwap!"
                ),
            )

        return CheckoutResponse(
            order_id=order.id,
            payment_id=payment.id,
            delivery_id=delivery.id,
            seller_id=request.seller_id,
            item_title=item_title,
            payment_url=payment_url,
            amount=request.amount,
            currency=self._settings.payment_currency,
            status="pending",
        )

    async def confirm_payment(
        self,
        session: AsyncSession,
        payment_id: uuid.UUID,
        user_id: uuid.UUID,
        success: bool,
    ) -> PaymentConfirmResponse:
        payment = await session.get(Payment, payment_id)
        if not payment:
            raise ApiError(status_code=404, code="not_found", message="Payment not found")

        if payment.status != "pending":
            raise ApiError(
                status_code=400,
                code="invalid_state",
                message=f"Payment status cannot be updated from '{payment.status}'",
            )

        order = await session.get(Order, payment.order_id)

        if success:
            payment.status = "completed"
            payment.transaction_reference = f"tx_sim_{secrets.token_hex(8)}"
            payment.receipt_url = f"/api/payment-delivery/payments/{payment.id}/invoice"
            if order:
                order.status = "paid"

            # Notify buyer
            buyer = await session.get(User, payment.user_id)
            if self._email_sender and buyer:
                await self._email_sender.send_order_notification(
                    recipient=buyer.email,
                    subject=f"UniSwap Payment Received - Receipt for Order #{str(payment.order_id)[:8]}",
                    message=(
                        f"Your payment of {payment.amount:.2f} {payment.currency} has been confirmed.\n"
                        f"Transaction Ref: {payment.transaction_reference}\n"
                        f"Receipt: {payment.receipt_url}"
                    ),
                )
        else:
            payment.status = "failed"
            if order:
                order.status = "cancelled"

        await session.commit()
        return PaymentConfirmResponse(
            payment_id=payment.id,
            status=payment.status,
            transaction_reference=payment.transaction_reference,
            receipt_url=payment.receipt_url,
        )

    async def process_refund(
        self, session: AsyncSession, payment_id: uuid.UUID, user_id: uuid.UUID
    ) -> RefundResponse:
        payment = await session.get(Payment, payment_id)
        if not payment:
            raise ApiError(status_code=404, code="not_found", message="Payment not found")

        if payment.status != "completed":
            raise ApiError(
                status_code=400,
                code="invalid_state",
                message="Only completed payments can be refunded.",
            )

        payment.status = "refunded"

        order = await session.get(Order, payment.order_id)
        if order:
            order.status = "cancelled"

        stmt = select(Delivery).where(Delivery.order_id == payment.order_id)
        res = await session.execute(stmt)
        delivery = res.scalar_one_or_none()
        if delivery:
            delivery.status = "cancelled"

        # Email buyer about refund
        buyer = await session.get(User, payment.user_id)
        if self._email_sender and buyer:
            await self._email_sender.send_order_notification(
                recipient=buyer.email,
                subject=f"UniSwap Refund Processed - Order #{str(payment.order_id)[:8]}",
                message=f"Your refund of {payment.amount:.2f} {payment.currency} has been processed successfully.",
            )

        await session.commit()
        return RefundResponse(payment_id=payment.id, status=payment.status)

    async def get_delivery_tracking(
        self, session: AsyncSession, delivery_id: uuid.UUID, user_id: uuid.UUID
    ) -> Delivery:
        delivery = await session.get(Delivery, delivery_id)
        if not delivery:
            raise ApiError(status_code=404, code="not_found", message="Delivery not found")
        return delivery

    async def schedule_meetup(
        self,
        session: AsyncSession,
        delivery_id: uuid.UUID,
        user_id: uuid.UUID,
        request: ScheduleMeetupRequest,
    ) -> Delivery:
        delivery = await session.get(Delivery, delivery_id)
        if not delivery:
            raise ApiError(status_code=404, code="not_found", message="Delivery not found")

        if delivery.delivery_method != "meetup":
            raise ApiError(
                status_code=400,
                code="invalid_method",
                message="Meetup scheduling is only available for meetup delivery method.",
            )

        delivery.meetup_location = request.meetup_location
        delivery.meetup_time = request.meetup_time
        delivery.status = "scheduled"

        # Notify buyer
        buyer = await session.get(User, delivery.user_id)
        if self._email_sender and buyer:
            await self._email_sender.send_order_notification(
                recipient=buyer.email,
                subject=f"UniSwap Meetup Scheduled - Order #{str(delivery.order_id)[:8]}",
                message=(
                    f"Campus Meetup has been scheduled:\n"
                    f"Location: {request.meetup_location}\n"
                    f"Time: {request.meetup_time.isoformat()}\n"
                    f"Verification Code: {delivery.verification_code}"
                ),
            )

        await session.commit()
        return delivery

    async def update_shipping_status(
        self,
        session: AsyncSession,
        delivery_id: uuid.UUID,
        user_id: uuid.UUID,
        request: ShippingStatusUpdateRequest,
    ) -> Delivery:
        delivery = await session.get(Delivery, delivery_id)
        if not delivery:
            raise ApiError(status_code=404, code="not_found", message="Delivery not found")

        delivery.status = request.status
        if request.carrier:
            delivery.carrier = request.carrier
        if request.tracking_number:
            delivery.tracking_number = request.tracking_number

        if delivery.status == "delivered":
            order = await session.get(Order, delivery.order_id)
            if order:
                order.status = "completed"

        buyer = await session.get(User, delivery.user_id)
        if self._email_sender and buyer:
            await self._email_sender.send_order_notification(
                recipient=buyer.email,
                subject=f"UniSwap Shipping Update - Order #{str(delivery.order_id)[:8]}",
                message=(
                    f"Shipping status updated to: {delivery.status.upper()}\n"
                    f"Carrier: {delivery.carrier or 'Courier'}\n"
                    f"Tracking Number: {delivery.tracking_number or 'N/A'}"
                ),
            )

        await session.commit()
        return delivery

    async def verify_meetup_qr(
        self,
        session: AsyncSession,
        delivery_id: uuid.UUID,
        user_id: uuid.UUID,
        verification_code: str,
    ) -> VerifyQRResponse:
        delivery = await session.get(Delivery, delivery_id)
        if not delivery:
            raise ApiError(status_code=404, code="not_found", message="Delivery not found")

        if delivery.verification_code.upper() != verification_code.upper().strip():
            return VerifyQRResponse(
                success=False,
                status=delivery.status,
                message="Invalid verification code. Please check and try again.",
            )

        delivery.status = "delivered"

        # Update order status to completed
        order = await session.get(Order, delivery.order_id)
        if order:
            order.status = "completed"

        # If payment was cash on meetup, mark payment completed
        stmt = select(Payment).where(Payment.order_id == delivery.order_id)
        res = await session.execute(stmt)
        payment = res.scalar_one_or_none()
        if payment and payment.payment_method == "cash_on_meetup" and payment.status == "pending":
            payment.status = "completed"
            payment.transaction_reference = f"tx_cash_{secrets.token_hex(6)}"

        # Send completion notifications
        buyer = await session.get(User, delivery.user_id)
        if self._email_sender and buyer:
            await self._email_sender.send_order_notification(
                recipient=buyer.email,
                subject=f"UniSwap Trade Completed - Order #{str(delivery.order_id)[:8]}",
                message="Campus meetup verification successful. Your item handoff is completed!",
            )

        await session.commit()
        return VerifyQRResponse(
            success=True,
            status=delivery.status,
            message="Meetup verification successful! Trade marked completed.",
        )

    async def list_user_payments(
        self, session: AsyncSession, user_id: uuid.UUID
    ) -> list[Payment]:
        stmt = (
            select(Payment)
            .where(or_(Payment.user_id == user_id, Payment.seller_id == user_id))
            .order_by(Payment.created_at.desc())
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def list_user_deliveries(
        self, session: AsyncSession, user_id: uuid.UUID, role: Literal["buyer", "seller", "all"] = "all"
    ) -> list[tuple[Delivery, bool]]:
        # Returns list of tuples: (delivery, is_buyer)
        if role == "buyer":
            stmt = select(Delivery).where(Delivery.user_id == user_id).order_by(Delivery.created_at.desc())
        elif role == "seller":
            stmt = select(Delivery).where(Delivery.seller_id == user_id).order_by(Delivery.created_at.desc())
        else:
            stmt = (
                select(Delivery)
                .where(or_(Delivery.user_id == user_id, Delivery.seller_id == user_id))
                .order_by(Delivery.created_at.desc())
            )
        res = await session.execute(stmt)
        deliveries = list(res.scalars().all())
        return [(d, d.user_id == user_id) for d in deliveries]

    async def get_invoice(
        self, session: AsyncSession, payment_id: uuid.UUID, user_id: uuid.UUID
    ) -> InvoiceResponse:
        payment = await session.get(Payment, payment_id)
        if not payment:
            raise ApiError(status_code=404, code="not_found", message="Payment not found")

        order = await session.get(Order, payment.order_id)
        if not order:
            raise ApiError(status_code=404, code="not_found", message="Order not found")

        stmt = select(Delivery).where(Delivery.order_id == payment.order_id)
        res = await session.execute(stmt)
        delivery = res.scalar_one_or_none()

        buyer = await session.get(User, payment.user_id)
        seller = await session.get(User, payment.seller_id) if payment.seller_id else None

        return InvoiceResponse(
            invoice_id=f"INV-{str(payment.id)[:8].upper()}",
            order_id=order.id,
            payment_id=payment.id,
            issue_date=payment.created_at,
            buyer_id=payment.user_id,
            buyer_email=buyer.email if buyer else None,
            seller_id=payment.seller_id,
            seller_email=seller.email if seller else None,
            item_title=order.item_title or "Marketplace Item",
            quantity=order.quantity,
            amount=float(payment.amount),
            currency=payment.currency,
            payment_method=payment.payment_method,
            payment_status=payment.status,
            delivery_method=delivery.delivery_method if delivery else "meetup",
            delivery_status=delivery.status if delivery else "scheduled",
            transaction_reference=payment.transaction_reference,
        )
