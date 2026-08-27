import asyncio
import hashlib
import time
from collections import defaultdict, deque

from app.errors import ApiError


class LoginRateLimiter:
    def __init__(self, *, attempts: int, window_seconds: int) -> None:
        self._attempts = attempts
        self._window_seconds = window_seconds
        self._attempt_log: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    @staticmethod
    def key(client_ip: str, normalized_identifier: str) -> str:
        material = f"{client_ip}:{normalized_identifier}".encode()
        return hashlib.sha256(material).hexdigest()

    async def consume(self, key: str, *, now: float | None = None) -> int | None:
        current_time = time.monotonic() if now is None else now
        cutoff = current_time - self._window_seconds

        async with self._lock:
            attempts = self._attempt_log[key]
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()

            if len(attempts) >= self._attempts:
                return max(1, int(self._window_seconds - (current_time - attempts[0])))

            attempts.append(current_time)
            return None

    async def reset(self, key: str) -> None:
        async with self._lock:
            self._attempt_log.pop(key, None)


class PasswordResetRateLimiter:
    """Process-local abuse protection for the public password-reset endpoint.

    IP limiting is public and may return 429. The email cooldown is deliberately
    silent and is consumed for known and unknown addresses alike so it cannot be
    used as an account-existence oracle.
    """

    def __init__(
        self,
        *,
        attempts: int,
        window_seconds: int,
        email_cooldown_seconds: int,
    ) -> None:
        self._attempts = attempts
        self._window_seconds = window_seconds
        self._email_cooldown_seconds = email_cooldown_seconds
        self._ip_attempts: dict[str, deque[float]] = defaultdict(deque)
        self._email_last_request: dict[str, float] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    async def check_ip(self, client_ip: str, *, now: float | None = None) -> None:
        current_time = time.monotonic() if now is None else now
        cutoff = current_time - self._window_seconds
        key = self._hash(client_ip)

        async with self._lock:
            attempts = self._ip_attempts[key]
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()

            if len(attempts) >= self._attempts:
                retry_after = max(
                    1,
                    int(self._window_seconds - (current_time - attempts[0])),
                )
                raise ApiError(
                    status_code=429,
                    code="too_many_password_reset_requests",
                    message="Too many password reset requests. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )

            attempts.append(current_time)

    async def acquire_email_cooldown(
        self,
        normalized_email: str,
        *,
        now: float | None = None,
    ) -> bool:
        current_time = time.monotonic() if now is None else now
        key = self._hash(normalized_email)

        async with self._lock:
            previous = self._email_last_request.get(key)
            if (
                previous is not None
                and current_time - previous < self._email_cooldown_seconds
            ):
                return False

            self._email_last_request[key] = current_time
            return True


class EmailVerificationRateLimiter:
    """Process-local protection for verification attempts and resend spam.

    This matches the repository's existing lightweight limiter pattern. A
    distributed deployment should move these counters to a shared atomic store.
    """

    def __init__(
        self,
        *,
        attempts: int,
        window_seconds: int,
        resend_cooldown_seconds: int,
    ) -> None:
        self._attempts = attempts
        self._window_seconds = window_seconds
        self._resend_cooldown_seconds = resend_cooldown_seconds
        self._attempt_log: dict[str, deque[float]] = defaultdict(deque)
        self._resend_last: dict[str, float] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    async def consume_attempt(
        self,
        *,
        client_ip: str,
        student_id: str,
        now: float | None = None,
    ) -> int | None:
        current_time = time.monotonic() if now is None else now
        cutoff = current_time - self._window_seconds
        key = self._hash(f"{client_ip}:{student_id}")
        async with self._lock:
            attempts = self._attempt_log[key]
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()
            if len(attempts) >= self._attempts:
                return max(1, int(self._window_seconds - (current_time - attempts[0])))
            attempts.append(current_time)
            return None

    async def reset_attempts(self, *, client_ip: str, student_id: str) -> None:
        key = self._hash(f"{client_ip}:{student_id}")
        async with self._lock:
            self._attempt_log.pop(key, None)

    async def acquire_resend_cooldown(
        self,
        student_id: str,
        *,
        now: float | None = None,
    ) -> bool:
        current_time = time.monotonic() if now is None else now
        key = self._hash(student_id)
        async with self._lock:
            previous = self._resend_last.get(key)
            if previous is not None and current_time - previous < self._resend_cooldown_seconds:
                return False
            self._resend_last[key] = current_time
            return True
