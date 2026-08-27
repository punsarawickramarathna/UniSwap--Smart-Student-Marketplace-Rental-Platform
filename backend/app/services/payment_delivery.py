import secrets
import string
import uuid
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models.order import Order
from app.models.payment import Payment
from app.models.delivery import Delivery
from app.schemas.payment_delivery import (
    CheckoutRequest,
    CheckoutResponse,
    PaymentConfirmResponse,
    RefundResponse,
    ScheduleMeetupRequest,
    VerifyQRResponse,
)


class PaymentDeliveryService:
    def _generate_verification_code(self) -> str:
        # Generates a unique 6-character verification code (uppercase alphanumeric)
        chars = string.ascii_uppercase + string.digits
        return "".join(secrets.choice(chars) for _ in range(6))

    def _generate_tracking_number(self) -> str:
        # Generates a tracking number like TRK-1234-5678
        digits = string.digits
        part1 = "".join(secrets.choice(digits) for _ in range(4))
        part2 = "".join(secrets.choice(digits) for _ in range(4))
        return f"TRK-{part1}-{part2}"

    async def checkout(
        self, session: AsyncSession, user_id: uuid.UUID, request: CheckoutRequest
    ) -> CheckoutResponse:
        # 1. Create order
        order = Order(
            user_id=user_id,
            total_amount=request.amount,
            status="pending",
        )
        session.add(order)
        await session.flush()  # populate order.id

        # 2. Create payment record
        payment = Payment(
            order_id=order.id,
            user_id=user_id,
            payment_method=request.payment_method,
            amount=request.amount,
            status="pending",
        )
        session.add(payment)
        await session.flush()  # populate payment.id

        # 3. Create delivery/pickup schedule record
        tracking_num = None
        if request.delivery_method == "shipping":
            tracking_num = self._generate_tracking_number()

        verification_code = self._generate_verification_code()
        
        # Simple hash simulation for QR verification
        qr_hash = f"qr_{verification_code.lower()}"

        delivery = Delivery(
            order_id=order.id,
            user_id=user_id,
            delivery_method=request.delivery_method,
            status="scheduled",
            tracking_number=tracking_num,
            meetup_location=request.meetup_location,
            meetup_time=request.meetup_time,
            qr_code_hash=qr_hash,
            verification_code=verification_code,
        )
        session.add(delivery)
        await session.commit()

        # Generate simulated Stripe redirect URL if credit card selected
        payment_url = None
        if request.payment_method == "stripe":
            payment_url = f"/payment-success?payment_id={payment.id}"

        return CheckoutResponse(
            order_id=order.id,
            payment_id=payment.id,
            delivery_id=delivery.id,
            payment_url=payment_url,
            amount=request.amount,
            status="pending",
        )

    async def confirm_payment(
        self, session: AsyncSession, payment_id: uuid.UUID, user_id: uuid.UUID, success: bool
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

        if success:
            payment.status = "completed"
            payment.transaction_reference = f"tx_sim_{secrets.token_hex(8)}"
            
            # Update corresponding order to paid
            order = await session.get(Order, payment.order_id)
            if order:
                order.status = "paid"
        else:
            payment.status = "failed"
            order = await session.get(Order, payment.order_id)
            if order:
                order.status = "cancelled"

        await session.commit()
        return PaymentConfirmResponse(payment_id=payment.id, status=payment.status)

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
        
        # Update order to cancelled
        order = await session.get(Order, payment.order_id)
        if order:
            order.status = "cancelled"

        # Update delivery to cancelled
        stmt = select(Delivery).where(Delivery.order_id == payment.order_id)
        res = await session.execute(stmt)
        delivery = res.scalar_one_or_none()
        if delivery:
            delivery.status = "cancelled"

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
        self, session: AsyncSession, delivery_id: uuid.UUID, user_id: uuid.UUID, request: ScheduleMeetupRequest
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

        await session.commit()
        return delivery

    async def verify_meetup_qr(
        self, session: AsyncSession, delivery_id: uuid.UUID, user_id: uuid.UUID, verification_code: str
    ) -> VerifyQRResponse:
        delivery = await session.get(Delivery, delivery_id)
        if not delivery:
            raise ApiError(status_code=404, code="not_found", message="Delivery not found")

        if delivery.verification_code.upper() != verification_code.upper():
            return VerifyQRResponse(success=False, status=delivery.status)

        delivery.status = "delivered"

        # Update order status to completed
        order = await session.get(Order, delivery.order_id)
        if order:
            order.status = "completed"

        # Update payment status if it was cash on meetup
        stmt = select(Payment).where(Payment.order_id == delivery.order_id)
        res = await session.execute(stmt)
        payment = res.scalar_one_or_none()
        if payment and payment.payment_method == "cash_on_meetup" and payment.status == "pending":
            payment.status = "completed"

        await session.commit()
        return VerifyQRResponse(success=True, status=delivery.status)

    async def list_user_payments(
        self, session: AsyncSession, user_id: uuid.UUID
    ) -> list[Payment]:
        stmt = select(Payment).where(Payment.user_id == user_id).order_by(Payment.created_at.desc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def list_user_deliveries(
        self, session: AsyncSession, user_id: uuid.UUID
    ) -> list[Delivery]:
        stmt = select(Delivery).where(Delivery.user_id == user_id).order_by(Delivery.created_at.desc())
        res = await session.execute(stmt)
        return list(res.scalars().all())
