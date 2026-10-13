import base64
import smtplib
import socketserver
import ssl
import threading
from email.message import EmailMessage
from unittest.mock import MagicMock, patch

import pytest

from app.services.email import SmtpEmailSender


class LoginOnlySmtpHandler(socketserver.StreamRequestHandler):
    """Reproduce a provider that closes AUTH PLAIN but accepts LOGIN."""

    def reply(self, value):
        self.wfile.write(value + b"\r\n")
        self.wfile.flush()

    def handle(self):
        self.reply(b"220 localhost test SMTP")
        while line := self.rfile.readline():
            command = line.decode().strip().upper()
            if command.startswith("EHLO"):
                self.reply(b"250-localhost")
                self.reply(b"250 AUTH LOGIN PLAIN")
            elif command.startswith("AUTH PLAIN"):
                return
            elif command == "AUTH LOGIN":
                self.reply(b"334 " + base64.b64encode(b"Username:"))
                username = base64.b64decode(self.rfile.readline().strip()).decode()
                self.reply(b"334 " + base64.b64encode(b"Password:"))
                password = base64.b64decode(self.rfile.readline().strip()).decode()
                if username == "sender@example.edu" and password == "valid-app-password":
                    self.reply(b"235 Authentication successful")
                else:
                    self.reply(b"535 Authentication rejected")
            elif command.startswith(("MAIL FROM:", "RCPT TO:")):
                self.reply(b"250 OK")
            elif command == "DATA":
                self.reply(b"354 End with a dot")
                lines = []
                while (line := self.rfile.readline()) and line != b".\r\n":
                    lines.append(line)
                self.server.messages.append(b"".join(lines))
                self.reply(b"250 Message accepted")
            elif command == "QUIT":
                self.reply(b"221 Bye")
                return
            else:
                self.reply(b"250 OK")


@pytest.fixture
def smtp_server():
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), LoginOnlySmtpHandler) as server:
        server.messages = []
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server
        finally:
            server.shutdown()
            thread.join()


def sender(port, *, password="valid-app-password", use_starttls=False):
    return SmtpEmailSender(
        mail_from="sender@example.edu",
        smtp_host="127.0.0.1",
        smtp_port=port,
        smtp_username="sender@example.edu",
        smtp_password=password,
        use_starttls=use_starttls,
    )


@pytest.mark.asyncio
async def test_login_auth_delivers_verification_and_reset_without_plain_disconnect(smtp_server):
    email_sender = sender(smtp_server.server_address[1])
    await email_sender.send_email_verification(recipient="student@example.edu", code="123456", expires_minutes=10)
    await email_sender.send_password_reset(recipient="student@example.edu", reset_url="https://example.edu/reset", expires_minutes=30)
    assert len(smtp_server.messages) == 2
    assert b"Verification code: 123456" in smtp_server.messages[0]
    assert b"https://example.edu/reset" in smtp_server.messages[1]


@pytest.mark.asyncio
async def test_bad_credentials_raise_authentication_error_without_sending(smtp_server):
    with pytest.raises(smtplib.SMTPAuthenticationError) as caught:
        await sender(smtp_server.server_address[1], password="invalid").send_email_verification(
            recipient="student@example.edu", code="123456", expires_minutes=10,
        )
    assert caught.value.smtp_code == 535
    assert smtp_server.messages == []


@pytest.mark.parametrize("port", [465, 587])
def test_smtp_uses_verified_tls_for_each_secure_transport(port):
    with patch("app.services.email.smtplib.SMTP") as smtp, patch("app.services.email.smtplib.SMTP_SSL") as smtp_ssl:
        factory = smtp_ssl if port == 465 else smtp
        client = MagicMock()
        client.esmtp_features = {"auth": "PLAIN"}
        factory.return_value.__enter__.return_value = client
        sender(port, use_starttls=True)._send_message(EmailMessage())
        if port == 465:
            smtp.assert_not_called()
            client.starttls.assert_not_called()
            context = factory.call_args.kwargs["context"]
        else:
            smtp_ssl.assert_not_called()
            context = client.starttls.call_args.kwargs["context"]
            assert client.ehlo.call_count == 2
        assert context.verify_mode == ssl.CERT_REQUIRED
        assert context.check_hostname is True
        client.send_message.assert_called_once()
