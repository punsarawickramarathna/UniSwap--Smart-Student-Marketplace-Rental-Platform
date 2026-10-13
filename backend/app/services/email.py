import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from typing import Protocol


class EmailSender(Protocol):
    async def send_email_verification(
        self,
        *,
        recipient: str,
        code: str,
        expires_minutes: int,
    ) -> None: ...

    async def send_password_reset(
        self,
        *,
        recipient: str,
        reset_url: str,
        expires_minutes: int,
    ) -> None: ...

    async def send_order_notification(
        self,
        *,
        recipient: str,
        subject: str,
        message: str,
    ) -> None: ...


class SmtpEmailSender:
    def __init__(
        self,
        *,
        mail_from: str,
        smtp_host: str,
        smtp_port: int,
        smtp_username: str | None,
        smtp_password: str | None,
        use_starttls: bool,
        timeout_seconds: float = 10.0,
    ) -> None:
        self._mail_from = mail_from
        self._smtp_host = smtp_host
        self._smtp_port = smtp_port
        self._smtp_username = smtp_username
        self._smtp_password = smtp_password
        self._use_starttls = use_starttls
        self._timeout_seconds = timeout_seconds

    async def send_email_verification(
        self,
        *,
        recipient: str,
        code: str,
        expires_minutes: int,
    ) -> None:
        message = EmailMessage()
        message["From"] = self._mail_from
        message["To"] = recipient
        message["Subject"] = f"{code} is your UniSwap verification code"
        message.set_content(
            "Welcome to UniSwap. Verify your university email to activate your student account.\n\n"
            f"Verification code: {code}\n\n"
            f"This code expires in {expires_minutes} minutes and can be used once.\n"
            "If you did not create this account, you can ignore this email."
        )
        await asyncio.to_thread(self._send_message, message)

    async def send_password_reset(
        self,
        *,
        recipient: str,
        reset_url: str,
        expires_minutes: int,
    ) -> None:
        message = EmailMessage()
        message["From"] = self._mail_from
        message["To"] = recipient
        message["Subject"] = "Reset your UniSwap password"
        message.set_content(
            "We received a request to reset your UniSwap password.\n\n"
            f"Open this link to continue: {reset_url}\n\n"
            f"This link expires in {expires_minutes} minutes and can be used once.\n"
            "If you did not request a reset, you can ignore this email."
        )
        await asyncio.to_thread(self._send_message, message)

    async def send_order_notification(
        self,
        *,
        recipient: str,
        subject: str,
        message: str,
    ) -> None:
        email_msg = EmailMessage()
        email_msg["From"] = self._mail_from
        email_msg["To"] = recipient
        email_msg["Subject"] = subject
        email_msg.set_content(message)
        await asyncio.to_thread(self._send_message, email_msg)

    def _send_message(self, message: EmailMessage) -> None:
        # Port 465 starts TLS immediately; port 587 upgrades using STARTTLS.
        use_ssl = self._smtp_port == 465
        smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
        tls_context = ssl.create_default_context()
        kwargs = {"context": tls_context} if use_ssl else {}
        with smtp_class(
            self._smtp_host,
            self._smtp_port,
            timeout=self._timeout_seconds,
            **kwargs,
        ) as smtp:
            smtp.ehlo()
            if self._use_starttls and not use_ssl:
                smtp.starttls(context=tls_context)
                smtp.ehlo()
            if self._smtp_username:
                if "LOGIN" in smtp.esmtp_features.get("auth", "").upper().split():
                    # Some providers disconnect on AUTH PLAIN. Prefer the
                    # advertised LOGIN challenge/response flow when available.
                    credentials = iter((self._smtp_username, self._smtp_password or ""))

                    def auth_login(challenge: bytes | None = None) -> str:
                        return next(credentials)

                    smtp.auth("LOGIN", auth_login, initial_response_ok=False)
                else:
                    smtp.login(self._smtp_username, self._smtp_password or "")
            smtp.send_message(message)
