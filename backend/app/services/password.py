from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError


MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128


class PasswordPolicyError(ValueError):
    pass


class PasswordService:
    def __init__(self) -> None:
        self._password_hash = PasswordHash.recommended()
        self._dummy_hash = self._password_hash.hash("uniswap-dummy-password")

    def validate_new_password(self, password: str) -> None:
        """Apply UniSwap's centralized password policy.

        Prefer length over brittle composition rules. The upper bound also limits
        avoidable Argon2 work on untrusted oversized input.
        """
        if len(password) < MIN_PASSWORD_LENGTH:
            raise PasswordPolicyError(
                f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
            )
        if len(password) > MAX_PASSWORD_LENGTH:
            raise PasswordPolicyError(
                f"Password must be at most {MAX_PASSWORD_LENGTH} characters."
            )
        if not password.strip():
            raise PasswordPolicyError("Password cannot contain only whitespace.")

    def hash(self, password: str) -> str:
        self.validate_new_password(password)
        return self._password_hash.hash(password)

    def verify(self, password: str, password_hash: str | None) -> bool:
        candidate_hash = password_hash or self._dummy_hash
        try:
            verified = self._password_hash.verify(password, candidate_hash)
        except (TypeError, ValueError, UnknownHashError):
            verified = False
        return bool(password_hash) and verified
