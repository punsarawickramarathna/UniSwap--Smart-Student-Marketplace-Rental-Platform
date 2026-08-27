# Member 1 Auth and Notifications Implementation Map

Foundation ticket: `UNI-M1-01`  
Latest implementation: `UNI-M1-10` revocable refresh sessions and session restoration.

## Confirmed Architecture

The repository's confirmed database is **Supabase PostgreSQL**. References to
MongoDB in the original proposal or ticket text are outdated.

```text
React + Axios -> FastAPI REST API -> Supabase PostgreSQL
                                  -> SMTP/email provider
```

FastAPI is the security and data-access boundary. The React application must not
connect directly to PostgreSQL, receive database credentials, or treat frontend
route guards as authorization. Authentication is planned as FastAPI-managed JWT,
not Supabase Auth, unless the team explicitly changes that decision later.

## Repository Findings

| Area | Exists now | Missing / implication |
| --- | --- | --- |
| Frontend | Vite, React, Tailwind, Axios, auth context, API service, login page, and server-backed startup restoration | Access tokens remain memory-only; the HttpOnly refresh cookie is unavailable to JavaScript. No router exists yet. |
| Backend | FastAPI app, async SQLAlchemy setup, central errors/config, auth router, reusable current-user dependency, and revocable refresh-session service | Registration and the remaining auth endpoints are future tickets. |
| Database | Supabase CLI config and a `public.users` migration | The migration enables RLS and revokes Data API client roles. A least-privileged runtime role is still a deployment task. |
| Auth | Argon2 passwords, short-lived JWTs, hashed rotating refresh sessions, login/refresh/logout, and protected `GET /api/auth/me` | The rate limiter is process-local and must become shared before multi-worker deployment. |
| Notifications | Feature names appear in `README.md` | No notification model, service, event contract, email adapter, scheduler, endpoint, or test exists. |
| Tests | Backend API/security tests and frontend login-flow tests | Supabase remote integration tests remain pending until credentials are rotated and the project is linked safely. |

Future tickets must reuse the FastAPI app, SQLAlchemy session factory, settings,
error envelope, password/JWT services, Axios instance, and React auth context now
present in the repository.

## Ownership Boundary

### Member 1 owns

- Student registration identity fields and normalized email uniqueness.
- Configurable university-domain eligibility checks.
- Password hashing and password verification.
- Email verification and password-reset one-time tokens.
- Login, logout semantics, JWT issuance, and protected FastAPI dependencies.
- In-app notification persistence, reads, unread counts, and read state.
- Notification event ingestion, idempotency, rendering, and email-delivery status.
- Rental due-date reminder scheduling and dispatch after Member 3 supplies rental events.
- Auth and notification pages/components once a frontend exists.

### Member 1 does not own

- Products, categories, product images, reviews, or ratings (Member 2).
- Carts, wishlists, orders, rental bookings, exchanges, or rental status (Member 3).
- Payments, Stripe integration, delivery, pickup, or delivery status (Member 4).
- Product approval decisions, moderation, admin workflows, or recommendations (Member 5).

Other members must not write Member 1 tables directly. They publish a contract
event after their own transaction succeeds; Member 1 converts it into one or more
notifications. Member 1 must not update another member's aggregate in response.

## Member 1 Modules

Implemented authentication paths are marked `[implemented]`; other paths remain
reserved for their own tickets.

```text
backend/app/
  config.py                         # [implemented] shared settings
  database.py                       # [implemented] async SQLAlchemy foundation
  errors.py                         # [implemented] consistent API errors
  main.py                           # [implemented] app and CORS setup
  dependencies/database.py          # [implemented] shared request session
  dependencies/auth.py              # [implemented] current verified user
  models/user.py                     # [implemented]
  models/auth_session.py             # [implemented: hashed refresh sessions]
  models/notification.py
  models/notification_delivery.py
  models/notification_event.py
  models/rental_reminder.py
  routes/auth.py                     # [implemented: login/refresh/logout/me]
  routes/notifications.py
  schemas/auth.py                    # [implemented: login/current user]
  schemas/notifications.py
  services/auth.py                   # [implemented: login only]
  services/jwt.py                    # [implemented: access tokens]
  services/session.py                # [implemented: rotation/revocation]
  services/password.py               # [implemented: Argon2]
  services/rate_limit.py             # [implemented: process-local]
  services/email_service.py
  services/notification_service.py
  services/reminder_service.py
  utils/security.py

backend/tests/
  test_login.py                       # [implemented]
  test_auth_dependency.py             # [implemented]
  test_refresh_sessions.py            # [implemented]
  test_security_services.py           # [implemented]
  test_notifications.py
  test_rental_reminders.py

frontend/src/
  pages/LoginPage.jsx                 # [implemented]
  pages/notifications/
  components/notifications/
  services/api.js                     # [implemented] shared Axios client
  services/auth.js                    # [implemented: login only]
  context/AuthContext.jsx             # [implemented: in-memory access token]
  services/notifications.js
  state/auth/                        # use the state pattern selected by the team
```

Shared bootstrap files such as `backend/app/main.py`, database sessions,
migrations, global middleware, the React router, and the Axios base client are
team-owned foundation files. Member 1 may add its router or interceptor to them,
but must not create competing instances when another member has created one.

## Proposed Database Ownership

The login ticket creates only `public.users`. Other names remain provisional
until their implementation tickets.

| Table | Owner | Purpose / required invariant |
| --- | --- | --- |
| `users` | Member 1 | Implemented: normalized unique email, Argon2 hash, verification state, active state, and timestamps. No product/order/admin data. |
| `auth_sessions` | Member 1 | Implemented: hashed random refresh credentials, fixed expiry, rotation family, revocation, and replay detection. |
| `auth_one_time_tokens` | Member 1 | Implemented for password-reset issuance: SHA-256 token hash, explicit purpose, expiry, consumed/invalidated state. Raw credentials are never persisted; the same table can safely support future email-verification tokens with a separate purpose. |
| `notifications` | Member 1 | Recipient, type, rendered content, resource reference, read timestamp, creation timestamp. |
| `notification_events` | Member 1 | Validated inbound event and unique idempotency key. Duplicate keys have no additional effect. |
| `notification_deliveries` | Member 1 | Per-channel delivery status and retry metadata. Email failure does not roll back the source event or in-app notification. |
| `rental_reminder_jobs` | Member 1 | Due time and reminder state keyed to Member 3's rental ID. It does not own rental status. |

Foreign identifiers from other modules are opaque UUIDs. Member 1 stores a
resource type and ID for navigation/idempotency, not copied order, payment,
product, delivery, or rental records.

For the planned FastAPI-only data path, database credentials stay on the backend.
Use a least-privileged runtime PostgreSQL role once migrations establish it; keep
the `postgres` role for controlled setup/migrations. If tables remain in an
exposed Supabase schema, enable RLS and revoke unneeded `anon`/`authenticated`
grants, or disable the Data API when the team confirms it is unused.

## Planned Endpoint Surface

Login and current-user endpoints are implemented. Remaining rows describe the
expected future Member 1 REST surface:

| Method and path | Responsibility |
| --- | --- |
| `POST /api/auth/register` | Future: register a normalized, allowed-domain student account and queue verification email. |
| `POST /api/auth/verify-email` | Future: consume a single-use verification token. |
| `POST /api/auth/resend-verification` | Future: enumeration/rate-limit-safe verification resend. |
| `POST /api/auth/login` | Implemented: authenticate verified active users and return a short-lived access token. |
| `POST /api/auth/refresh` | Implemented: rotate a valid refresh session and return a new short-lived access token. |
| `POST /api/auth/logout` | Implemented: revoke the refresh family and clear its browser cookie. |
| `POST /api/auth/forgot-password` | Implemented: normalize/validate email, return a non-enumerating accepted response, silently enforce email cooldown, issue only hashed expiring reset tokens for eligible active users, and deliver through the email adapter using trusted `FRONTEND_BASE_URL`. |
| `POST /api/auth/reset-password` | Future: consume a single-use reset token and replace the password hash. |
| `GET /api/auth/me` | Implemented: validate Bearer JWT, re-check the current verified/active user, and return only ID and email. |
| `GET /api/notifications` | Future: list only the authenticated user's notifications. |
| `GET /api/notifications/unread-count` | Future: return the authenticated user's unread count. |
| `PATCH /api/notifications/{notification_id}/read` | Future: mark an owned notification read. |
| `POST /api/notifications/read-all` | Future: mark the authenticated user's notifications read. |

Logout revokes only the rotating refresh-session family for the current browser
session. Existing access JWTs are stateless and are **not** denylisted, so an
already-issued access JWT can remain valid until its short configured expiry. The
frontend clears its in-memory access token immediately and cannot use the revoked
refresh credential to obtain another one.

Cross-member event ingestion should initially be an internal Python service call,
not a public browser endpoint. If deployments later require HTTP or a queue, the
same envelope below must be authenticated service-to-service and validated by
Pydantic.

## Cross-Member Event Contract

All producers call a future interface equivalent to
`NotificationService.publish(event: NotificationEvent)`. The transport-neutral
version 1 envelope is:

```json
{
  "schema_version": 1,
  "idempotency_key": "producer:event-type:aggregate-id:transition",
  "event_type": "order.status_changed",
  "occurred_at": "2026-08-25T10:30:00Z",
  "recipient_user_id": "uuid",
  "actor_user_id": "uuid-or-null",
  "resource": {
    "type": "order",
    "id": "uuid"
  },
  "data": {
    "status": "ready_for_pickup"
  }
}
```

Contract rules:

- `idempotency_key`, `event_type`, UTC `occurred_at`, recipient, and resource are required.
- Producers create stable idempotency keys; retries reuse the same key.
- Payload variants are strict Pydantic models per event type, not arbitrary dictionaries.
- Producers pass identifiers and approved display fields only; never passwords, tokens, payment credentials, or sensitive delivery details.
- Member 1 owns notification title/body templates and generates internal links from trusted resource types/IDs. Producer-supplied HTML or redirect URLs are rejected.
- Unknown event types or invalid transitions fail validation and create no notification.
- Publishing records the event/in-app notification transactionally. Email is attempted separately and records `pending`, `sent`, or `failed` without corrupting the producer transaction.

### Required producer events

| Producer | Event type | Required `data` | Boundary |
| --- | --- | --- | --- |
| Member 2 | No notification event currently required | Stable `product_id`, owner user ID, and safe display name must be available to Member 5's approval workflow. | Member 1 does not query or copy product business state. |
| Member 3 | `order.status_changed` | `order_number`, `previous_status`, `status` | Member 3 validates and commits the order transition first. |
| Member 3 | `rental.reminder_scheduled` | `due_at` (UTC), optional safe product display name | Upserts a reminder by idempotency key; Member 1 does not create the rental. |
| Member 3 | `rental.reminder_cancelled` | `reason` (`returned`, `cancelled`, or `rescheduled`) | Cancels pending reminders for the supplied rental ID. Rescheduling uses cancel plus a new schedule event. |
| Member 4 | `payment.status_changed` | `payment_reference`, `previous_status`, `status` | No card/bank details; Member 4 owns Stripe verification and state. |
| Member 4 | `delivery.status_changed` | `previous_status`, `status` | No address payload; Member 4 validates the delivery transition. |
| Member 5 | `product.approval_decided` | `decision` (`approved` or `rejected`), optional short reason | Member 5 owns the decision; recipient is the product owner supplied from the product contract. |

Every producer must provide a stable user UUID that references Member 1's `users`
identity. Exact order, rental, payment, delivery, and product status enums remain
owned by their producer and must be agreed before those payload models are coded.

## Configuration Strategy

`.env.example` is the committed variable catalog. Local values belong in ignored
`.env`; deployed values belong in the deployment platform's secret manager.

- Database: `DATABASE_URL` is backend-only and requires TLS. The direct Supabase
  endpoint is suitable for a persistent FastAPI host with IPv6; use the dashboard's
  session-pooler URL when the runtime is IPv4-only. Never expose this URL to React.
- JWT: `JWT_SECRET_KEY`, algorithm, issuer, audience, and short access-token expiry
  are backend-only. Generate a random secret per environment.
- Refresh sessions: expiry and rotation grace are configurable. The browser gets
  only an HttpOnly SameSite cookie; PostgreSQL stores only its SHA-256 hash. Use
  `REFRESH_COOKIE_SECURE=true` in production. A cross-site deployment must use
  `SameSite=None`, HTTPS, explicit CORS origins, credentials, and the required
  `X-CSRF-Protection` header.
- Student email: `ALLOWED_STUDENT_EMAIL_DOMAINS` is a comma-separated allowlist,
  normalized to lowercase. An empty production value must fail startup.
- One-time tokens: reset expiry is configurable. Password-reset issuance persists only
  a SHA-256 hash of a high-entropy random token. New reset tokens invalidate older
  active reset tokens without affecting email-verification purpose rows. Future reset
  consumption must atomically enforce expiry, purpose, unused state, and single use.
- Password recovery abuse controls: `PASSWORD_RESET_RATE_LIMIT_*` applies a public
  per-IP limit; `PASSWORD_RESET_COOLDOWN_SECONDS` is a silent per-normalized-email
  cooldown consumed for known and unknown addresses alike. The current limiter is
  process-local and must move to a shared atomic store before multi-worker deployment.
- Email: SMTP credentials are backend-only. `FRONTEND_BASE_URL` is used to build
  verification/reset links from trusted configuration, never a request parameter.
- CORS: `CORS_ALLOWED_ORIGINS` is an explicit comma-separated list. Credentialed
  requests are enabled, so wildcard origins are rejected at startup.
- Reminders: scan interval and hours-before-due are configurable. Times are stored
  and compared in UTC, and reminder event keys make retries idempotent.

## Reuse Check Before Future Tickets

At the start of every implementation ticket, repeat `rg --files` and inspect newly
merged foundation code. In particular, reuse any existing FastAPI application,
SQLAlchemy session, Alembic setup, settings class, error schema, React router,
Axios instance, and test fixtures. Update this map if the team establishes paths
or contracts that differ from these proposals.

## Current Blockers and Team Decisions

- Member 1 now owns the initial FastAPI/Vite foundation. Teammates must extend the
  existing app, session factory, Axios client, and configuration instead of
  creating parallel instances.
- The process-local login and password-reset limiters are sufficient for one
  development process only; multi-worker production deployment needs a shared
  atomic rate-limit store.
- Member 3 must finalize rental IDs, due-date lifecycle, return/cancellation events,
  and status enums before reminder implementation.
- Members 3 and 4 must finalize order/payment/delivery status enums before strict
  event payload models are implemented.
- Members 2 and 5 must finalize the product ownership lookup and approval workflow
  before product-approval notifications are implemented.
- The team must confirm the deployment network. Supabase direct connections require
  IPv6 unless the project has an IPv4 add-on; otherwise use session pooling.
- The database password previously shared in chat must be rotated before any
  connection test or application setup.

## UNI-M1-14 — Reset password and revoke existing sessions

- `POST /api/auth/reset-password` accepts the opaque reset credential plus a new password.
- Password reset tokens are looked up by SHA-256 hash and `purpose=password_reset`, locked for update, and rejected through one generic invalid/expired/used response.
- New passwords use the centralized password policy in `PasswordService` (12–128 characters, not whitespace-only) and must differ from the current password.
- A successful reset updates the Argon2 password hash, consumes the current reset token, invalidates any other active password-reset tokens, and revokes every active refresh session for that user in one database transaction.
- Existing access JWTs remain stateless and may stay cryptographically valid until their short expiry; the React client clears its in-memory auth state after a successful reset.
- `/reset-password?token=...` provides the public reset form and returns the user to `/login` after success.

## Student registration, landing page and email-code verification

The public entry experience now starts at `/` and offers Student ID login and signup. New registrations require a canonical Student ID matching `ITBIN` followed by exactly eight digits and an email whose domain is listed in `ALLOWED_STUDENT_EMAIL_DOMAINS`. The backend remains the source of truth for both checks.

Registration creates an unverified account, persists only a keyed HMAC-SHA256 representation of the six-digit verification code, and sends the raw code only through the configured email adapter. Verification codes are purpose-scoped, expiring, single-use, invalidated when replaced, attempt-limited, and resend-cooldown protected. Successful verification sets `email_verified_at`; normal login remains unavailable until then.

The React public flow is `/` -> `/signup` -> `/verify-email` -> `/login` -> protected application routes. In-app navigation uses the browser View Transitions API when available, with CSS and reduced-motion fallbacks rather than making animation a security or routing dependency.
