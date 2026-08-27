import uuid
from datetime import datetime, timezone, timedelta
import pytest
from httpx import Response
from sqlalchemy import select

from app.models.user import User
from app.models.order import Order
from app.models.payment import Payment
from app.models.delivery import Delivery

PASSWORD = "Strong-password-123"
CSRF_HEADERS = {"X-CSRF-Protection": "1"}


async def add_user(app_context, email: str = "student4@campus.edu") -> User:
    app, session_factory = app_context
    user = User(
        email=email,
        password_hash=app.state.password_service.hash(PASSWORD),
        email_verified_at=datetime.now(timezone.utc),
        is_active=True,
    )
    async with session_factory() as session:
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user


async def login(client, user: User) -> str:
    response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": PASSWORD},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_checkout_stripe_creates_pending_order_and_payment(client, app_context):
    user = await add_user(app_context)
    access_token = await login(client, user)
    headers = {"Authorization": f"Bearer {access_token}", **CSRF_HEADERS}

    checkout_data = {
        "amount": 120.50,
        "payment_method": "stripe",
        "delivery_method": "shipping",
    }

    response = await client.post(
        "/api/payment-delivery/checkout",
        json=checkout_data,
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["amount"] == 120.50
    assert body["status"] == "pending"
    assert "payment_url" in body
    assert body["payment_url"] is not None

    _, session_factory = app_context
    async with session_factory() as session:
        # Verify database records
        order = await session.get(Order, uuid.UUID(body["order_id"]))
        assert order is not None
        assert order.status == "pending"
        assert float(order.total_amount) == 120.50

        payment = await session.get(Payment, uuid.UUID(body["payment_id"]))
        assert payment is not None
        assert payment.status == "pending"
        assert payment.payment_method == "stripe"

        delivery = await session.get(Delivery, uuid.UUID(body["delivery_id"]))
        assert delivery is not None
        assert delivery.delivery_method == "shipping"
        assert delivery.status == "scheduled"
        assert delivery.tracking_number.startswith("TRK-")


@pytest.mark.asyncio
async def test_checkout_cash_on_meetup_schedules_meetup(client, app_context):
    user = await add_user(app_context, email="student_cash@campus.edu")
    access_token = await login(client, user)
    headers = {"Authorization": f"Bearer {access_token}", **CSRF_HEADERS}

    meetup_time = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    checkout_data = {
        "amount": 45.00,
        "payment_method": "cash_on_meetup",
        "delivery_method": "meetup",
        "meetup_location": "Main Library Lobby",
        "meetup_time": meetup_time,
    }

    response = await client.post(
        "/api/payment-delivery/checkout",
        json=checkout_data,
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["payment_url"] is None

    _, session_factory = app_context
    async with session_factory() as session:
        delivery = await session.get(Delivery, uuid.UUID(body["delivery_id"]))
        assert delivery is not None
        assert delivery.delivery_method == "meetup"
        assert delivery.meetup_location == "Main Library Lobby"
        assert delivery.verification_code is not None


@pytest.mark.asyncio
async def test_confirm_payment_updates_status_to_completed(client, app_context):
    user = await add_user(app_context, email="student_confirm@campus.edu")
    access_token = await login(client, user)
    headers = {"Authorization": f"Bearer {access_token}", **CSRF_HEADERS}

    # 1. Checkout
    checkout_res = await client.post(
        "/api/payment-delivery/checkout",
        json={"amount": 80.00, "payment_method": "stripe", "delivery_method": "shipping"},
        headers=headers,
    )
    payment_id = checkout_res.json()["payment_id"]
    order_id = checkout_res.json()["order_id"]

    # 2. Confirm payment
    confirm_res = await client.post(
        f"/api/payment-delivery/payments/{payment_id}/confirm",
        json={"success": True},
        headers=headers,
    )
    assert confirm_res.status_code == 200
    assert confirm_res.json()["status"] == "completed"

    _, session_factory = app_context
    async with session_factory() as session:
        payment = await session.get(Payment, uuid.UUID(payment_id))
        assert payment.status == "completed"
        assert payment.transaction_reference.startswith("tx_sim_")

        order = await session.get(Order, uuid.UUID(order_id))
        assert order.status == "paid"


@pytest.mark.asyncio
async def test_refund_updates_status(client, app_context):
    user = await add_user(app_context, email="student_refund@campus.edu")
    access_token = await login(client, user)
    headers = {"Authorization": f"Bearer {access_token}", **CSRF_HEADERS}

    # 1. Checkout & Confirm
    checkout_res = await client.post(
        "/api/payment-delivery/checkout",
        json={"amount": 50.00, "payment_method": "stripe", "delivery_method": "shipping"},
        headers=headers,
    )
    payment_id = checkout_res.json()["payment_id"]
    await client.post(
        f"/api/payment-delivery/payments/{payment_id}/confirm",
        json={"success": True},
        headers=headers,
    )

    # 2. Refund
    refund_res = await client.post(
        f"/api/payment-delivery/payments/{payment_id}/refund",
        json={"reason": "Item not as described"},
        headers=headers,
    )
    assert refund_res.status_code == 200
    assert refund_res.json()["status"] == "refunded"


@pytest.mark.asyncio
async def test_qr_verification_marks_delivery_and_order_completed(client, app_context):
    user = await add_user(app_context, email="student_qr@campus.edu")
    access_token = await login(client, user)
    headers = {"Authorization": f"Bearer {access_token}", **CSRF_HEADERS}

    # 1. Checkout
    checkout_res = await client.post(
        "/api/payment-delivery/checkout",
        json={"amount": 35.00, "payment_method": "cash_on_meetup", "delivery_method": "meetup"},
        headers=headers,
    )
    delivery_id = checkout_res.json()["delivery_id"]
    order_id = checkout_res.json()["order_id"]

    _, session_factory = app_context
    async with session_factory() as session:
        d = await session.get(Delivery, uuid.UUID(delivery_id))
        code = d.verification_code

    # 2. Verify with wrong code
    verify_res = await client.post(
        f"/api/payment-delivery/deliveries/{delivery_id}/verify-qr",
        json={"verification_code": "WRONG1"},
        headers=headers,
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["success"] is False

    # 3. Verify with correct code
    verify_res = await client.post(
        f"/api/payment-delivery/deliveries/{delivery_id}/verify-qr",
        json={"verification_code": code},
        headers=headers,
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["success"] is True

    async with session_factory() as session:
        d = await session.get(Delivery, uuid.UUID(delivery_id))
        assert d.status == "delivered"
        o = await session.get(Order, uuid.UUID(order_id))
        assert o.status == "completed"
