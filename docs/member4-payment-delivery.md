# Member 4 Payment and Delivery Implementation Map

Module: **Payment & Delivery / Campus Handoff System**  
Assigned Member: **Member 4**  
Status: **Implemented & Verified on `Payment-Delivery` branch**

---

## 1. Architectural Overview

The UniSwap Payment and Delivery module provides university students with secure, flexible options for student-to-student transactions:
1. **Online Payments (Stripe Gateway)**: Secure card payment with support for real Stripe Checkout sessions and test simulations.
2. **Cash on Delivery / Meetup**: Offline peer-to-peer settlement at designated campus meetup spots.
3. **Campus Meetup Verification (QR Code & 6-character Code)**: Peer-to-peer physical delivery verification ensuring funds are protected until the buyer physically inspects and confirms receipt of the item.
4. **Parcel Courier Tracking**: Supports standard post/courier shipping (SL Post, Prompt, Koombiyo) with carrier tracking numbers and status lifecycle transitions (`processing` ➔ `shipped` ➔ `in_transit` ➔ `delivered`).
5. **Printable Invoices & Official Receipts**: Instant, printable student marketplace receipts with transaction references.
6. **Email Notifications**: Automatic email receipts and status dispatch via Member 1's notification channels.

```text
React (Vite + Tailwind) 
  ├── CheckoutPage (Item selection, Meetup / Shipping options, Stripe / Cash)
  ├── DeliveryDashboardPage (Buyer & Seller views, QR modal, Courier updater, Invoices)
  └── PaymentSuccessPage (Receipt generator, verification status)
         │
         ▼ (Axios REST API with JWT Auth)
FastAPI Backend
  ├── /api/payment-delivery/checkout
  ├── /api/payment-delivery/payments/{id}/confirm
  ├── /api/payment-delivery/payments/{id}/refund
  ├── /api/payment-delivery/payments/{id}/invoice
  ├── /api/payment-delivery/deliveries/user
  ├── /api/payment-delivery/deliveries/{id}/schedule
  ├── /api/payment-delivery/deliveries/{id}/shipping-status
  ├── /api/payment-delivery/deliveries/{id}/verify-qr
  └── /api/payment-delivery/webhook/stripe
         │
         ├──> Supabase PostgreSQL (orders, payments, deliveries)
         ├──> Stripe SDK (Payment Intents, Checkout Sessions, Webhooks)
         └──> EmailSender / SMTP (Receipts, Pickup Alerts, Delivery updates)
```

---

## 2. Ownership Boundary

### Member 4 Owns:
- **Payment Processing**:
  - Payment records (`Payment` model), status lifecycle (`pending`, `completed`, `refunded`, `failed`).
  - Stripe Checkout Session creation and webhook signature handling.
  - Cash on Meetup transaction lifecycle.
  - Refund processing and cancellation synchronization.
  - Official Invoice and Receipt generation (`InvoiceResponse`).
- **Delivery & Fulfillment**:
  - Delivery records (`Delivery` model), status transitions (`scheduled`, `processing`, `shipped`, `in_transit`, `delivered`, `cancelled`).
  - Campus meetup location & time scheduling (`ScheduleMeetupRequest`).
  - Handoff Verification: High-entropy 6-character alphanumeric code + QR code generation & seller verification endpoint.
  - Courier parcel tracking: Carrier name, tracking number, and live fulfillment status updates.
  - Buyer and Seller dashboard views (`role="buyer"`, `role="seller"`, `role="all"`).
- **Provisional Order Mapping**:
  - `Order` lightweight aggregate holding buyer ID, seller ID, item details, quantity, total amount, and status.

### Member 4 Integrates With:
- **Member 1 (Auth & Notifications)**: Consumes `get_current_user` dependency for student authentication and uses `EmailSender` to dispatch order confirmations, payment receipts, meetup schedules, and delivery updates.
- **Member 2 (Products)**: Receives product title, price, and seller ID via query params / checkout payload.
- **Member 3 (Cart & Orders)**: Designed for zero-friction schema replacement once Member 3's final Order schema is unified.

---

## 3. Database Schema

The module introduces three tables with Row-Level Security (RLS) enabled in PostgreSQL:

### `public.orders` (Provisional Aggregate)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | Primary Key | Order unique identifier |
| `user_id` | UUID | Not Null, FK -> `users.id` | Buyer student ID |
| `seller_id` | UUID | Nullable, FK -> `users.id` | Seller student ID |
| `item_title` | TEXT | Nullable | Name of item |
| `quantity` | INTEGER | Not Null, Default 1 | Item quantity |
| `total_amount` | NUMERIC(10, 2) | Not Null | Total order value |
| `status` | TEXT | Check (`pending`, `paid`, `completed`, `cancelled`) | Order state |
| `created_at` | TIMESTAMPTZ | Not Null | Timestamp |
| `updated_at` | TIMESTAMPTZ | Not Null | Timestamp |

### `public.payments`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | Primary Key | Payment transaction ID |
| `order_id` | UUID | Not Null, FK -> `orders.id` | Associated order |
| `user_id` | UUID | Not Null, FK -> `users.id` | Payer / Buyer |
| `seller_id` | UUID | Nullable, FK -> `users.id` | Payee / Seller |
| `payment_method` | TEXT | Check (`stripe`, `cash_on_meetup`) | Method of settlement |
| `amount` | NUMERIC(10, 2) | Not Null | Transaction sum |
| `currency` | TEXT | Not Null, Default `LKR` | Payment currency |
| `status` | TEXT | Check (`pending`, `completed`, `refunded`, `failed`) | Escrow status |
| `transaction_reference` | TEXT | Unique, Nullable | Gateway or Cash txn ref |
| `stripe_payment_intent_id` | TEXT | Nullable | Stripe session/intent ID |
| `receipt_url` | TEXT | Nullable | Invoice / receipt URL |
| `created_at` | TIMESTAMPTZ | Not Null | Timestamp |
| `updated_at` | TIMESTAMPTZ | Not Null | Timestamp |

### `public.deliveries`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | Primary Key | Delivery tracking ID |
| `order_id` | UUID | Not Null, FK -> `orders.id` | Associated order |
| `user_id` | UUID | Not Null, FK -> `users.id` | Buyer / Recipient |
| `seller_id` | UUID | Nullable, FK -> `users.id` | Seller / Dispatcher |
| `delivery_method` | TEXT | Check (`meetup`, `shipping`) | Delivery category |
| `status` | TEXT | Check (`scheduled`, `processing`, `shipped`, `in_transit`, `delivered`, `cancelled`) | Fulfillment stage |
| `tracking_number` | TEXT | Unique, Nullable | Courier parcel tracking |
| `carrier` | TEXT | Nullable | Courier name (SL Post, Koombiyo, etc.) |
| `shipping_address` | TEXT | Nullable | Student hostel / residential address |
| `meetup_location` | TEXT | Nullable | Campus landmark (Library, Gym, Canteen) |
| `meetup_time` | TIMESTAMPTZ | Nullable | Scheduled rendezvous |
| `qr_code_hash` | TEXT | Nullable | Verification token hash |
| `verification_code` | TEXT | Not Null | 6-char high-entropy code |
| `created_at` | TIMESTAMPTZ | Not Null | Timestamp |
| `updated_at` | TIMESTAMPTZ | Not Null | Timestamp |

---

## 4. API Endpoints Specification

All endpoints are mounted under `/api/payment-delivery` and require `Authorization: Bearer <token>` (except Stripe Webhooks).

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/payment-delivery/checkout` | Initiates checkout, creates Order, Payment, and Delivery; returns Stripe URL or simulated redirection. |
| `POST` | `/api/payment-delivery/payments/{id}/confirm` | Confirms payment success; marks order as `paid`, sets invoice receipt. |
| `POST` | `/api/payment-delivery/payments/{id}/refund` | Reverses a completed payment and marks order/delivery as `cancelled`. |
| `GET` | `/api/payment-delivery/payments/{id}/invoice` | Generates official student marketplace invoice details with buyer/seller info. |
| `GET` | `/api/payment-delivery/payments/user` | Lists user's transaction history. |
| `GET` | `/api/payment-delivery/deliveries/user?role={buyer\|seller\|all}` | Lists deliveries partitioned by Buyer or Seller role. |
| `POST` | `/api/payment-delivery/deliveries/{id}/schedule` | Updates meetup location and rendezvous time. |
| `POST` | `/api/payment-delivery/deliveries/{id}/shipping-status` | Seller updates parcel carrier, tracking number, and transit status. |
| `GET` | `/api/payment-delivery/deliveries/{id}/tracking` | Retrieves live tracking details for a single delivery. |
| `POST` | `/api/payment-delivery/deliveries/{id}/verify-qr` | Seller verifies buyer's 6-character code/QR; marks order and delivery as `delivered` and settles cash payment. |
| `POST` | `/api/payment-delivery/webhook/stripe` | Webhook endpoint for asynchronous payment notifications from Stripe. |

---

## 5. Security & Verification Protocol

### Peer-to-Peer Handoff Verification
To prevent fraudulent claims that an item was never received during campus physical meetups:
1. When an order is placed with `delivery_method: "meetup"`, the system generates an unguessable 6-character uppercase alphanumeric code using Python's cryptographically secure `secrets.choice`.
2. The code is rendered as a QR Code and textual code on the **Buyer's** app.
3. At the meetup, the Buyer inspects the textbook, laptop, or item.
4. If satisfied, the Buyer presents their QR code or gives the 6-character code to the Seller.
5. The Seller inputs the code into their Seller Dashboard.
6. The backend validates the code case-insensitively and atomically:
   - Sets `Delivery.status = "delivered"`
   - Sets `Order.status = "completed"`
   - Settle `Payment.status = "completed"` (if cash on meetup)
   - Dispatches transaction completion emails to both students.

### Stripe Webhook & Secret Handling
- Stripe API keys are configured through `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` in `.env`.
- In local development or test environments where Stripe keys are omitted or set to placeholders, the system falls back to sandboxed simulations gracefully without throwing network errors.

---

## 6. Automated Test Coverage

The test suite in `backend/tests/test_payment_delivery.py` covers:
- `test_checkout_stripe_creates_pending_order_and_payment`: Validates Stripe order creation, tracking numbers, and redirection URL.
- `test_checkout_cash_on_meetup_schedules_meetup`: Validates cash payment creation and meetup schedule parameters.
- `test_confirm_payment_updates_status_to_completed`: Validates status transitions from pending to completed and transaction references.
- `test_refund_updates_status`: Validates refund processing and cascade cancellation.
- `test_qr_verification_marks_delivery_and_order_completed`: Tests invalid code rejection and successful QR code verification.
- `test_seller_buyer_flow_and_invoice_and_shipping`: End-to-end integration test verifying buyer checkout, seller delivery listing, courier status updating, invoice generation, and email alerts.
