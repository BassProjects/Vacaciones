"""Authenticated SMTP through the authorized proxy with verified end-to-end TLS."""

import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formatdate, parseaddr

from pydantic import EmailStr, TypeAdapter

from app.smtp_client import connect_smtp


class DeliveryError(Exception):
    """Provider-independent, non-sensitive delivery outcome for the outbox."""

    def __init__(self, state, code, retry_after=60):
        self.state, self.code, self.retry_after = state, code, retry_after
        super().__init__(code)


def open_smtp(settings):
    """Connect with verified TLS; production must use the platform's proxy."""
    if settings.environment == "production" and not os.environ.get("SMTP_PROXY_URL"):
        raise ValueError("SMTP proxy required in production")
    return connect_smtp(
        settings.smtp_host,
        settings.smtp_port,
        settings.smtp_security,
        timeout=10,
        local_hostname="vacaciones",
    )


class SMTPTransport:
    def __init__(self, settings):
        self.settings = settings

    def close(self):
        # Each send owns and closes its connection, including on error.
        pass

    def send(self, recipient, subject, html, text_body, message_key):
        if not self.settings.mail_configured:
            raise DeliveryError("failed", "SMTP_NOT_CONFIGURED")
        try:
            recipient = str(TypeAdapter(EmailStr).validate_python(recipient))
            sender = parseaddr(self.settings.sender)[1]
            message = EmailMessage()
            message["To"] = recipient
            message["From"] = self.settings.sender
            message["Subject"] = subject
            message["Date"] = formatdate(localtime=False)
            # A stable ID helps investigation, not guaranteed provider deduplication.
            message["Message-ID"] = f"<{message_key}@{sender.rsplit('@', 1)[1]}>"
            message.set_content(text_body)
            message.add_alternative(html, subtype="html")
        except (ValueError, TypeError, IndexError):
            raise DeliveryError("failed", "SMTP_INVALID_MESSAGE") from None

        connection = None
        transmitting = False
        try:
            # connect_smtp already negotiates TLS; never issue STARTTLS a second time.
            connection = open_smtp(self.settings)
            connection.login(self.settings.smtp_user, self.settings.smtp_password)
            transmitting = True
            refused = connection.send_message(message, from_addr=sender, to_addrs=[recipient])
            if refused:
                raise smtplib.SMTPRecipientsRefused(refused)
            # The server accepted the message; this is not proof of inbox delivery.
            return str(message["Message-ID"])
        except smtplib.SMTPRecipientsRefused as exc:
            temporary = bool(exc.recipients) and all(
                400 <= status[0] < 500 for status in exc.recipients.values()
            )
            raise DeliveryError(
                "pending" if temporary else "failed", "SMTP_RECIPIENT_REJECTED"
            ) from None
        except smtplib.SMTPResponseException as exc:
            code = (
                "SMTP_AUTH_REJECTED"
                if isinstance(exc, smtplib.SMTPAuthenticationError)
                else "SMTP_SERVER_REJECTED"
            )
            raise DeliveryError(
                "pending" if 400 <= exc.smtp_code < 500 else "failed", code
            ) from None
        except ssl.SSLError:
            raise DeliveryError(
                "uncertain" if transmitting else "failed",
                "SMTP_DELIVERY_UNCERTAIN" if transmitting else "SMTP_TLS_REJECTED",
            ) from None
        except smtplib.SMTPNotSupportedError:
            raise DeliveryError("failed", "SMTP_CAPABILITY_REJECTED") from None
        except ValueError:
            raise DeliveryError("failed", "SMTP_CONFIGURATION_INVALID") from None
        except (OSError, smtplib.SMTPException):
            # A lost response after DATA might mean the server already accepted the mail.
            raise DeliveryError(
                "uncertain" if transmitting else "pending",
                "SMTP_DELIVERY_UNCERTAIN" if transmitting else "SMTP_CONNECTION_FAILED",
            ) from None
        finally:
            if connection is not None:
                try:
                    # Closing must not turn an accepted delivery into an uncertain retry.
                    connection.close()
                except (OSError, smtplib.SMTPException):
                    pass
