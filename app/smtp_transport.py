"""Authenticated SMTP over verified TLS. Requires separately authorized TCP egress."""

import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formatdate, parseaddr

from pydantic import EmailStr, TypeAdapter


class DeliveryError(Exception):
    """Provider-independent, non-sensitive delivery outcome for the outbox."""

    def __init__(self, state, code, retry_after=60):
        self.state, self.code, self.retry_after = state, code, retry_after
        super().__init__(code)


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
            context = ssl.create_default_context()
            context.minimum_version = ssl.TLSVersion.TLSv1_2
            common = {
                "host": self.settings.smtp_host,
                "port": self.settings.smtp_port,
                "local_hostname": "vacaciones",
                "timeout": 10,
            }
            if self.settings.smtp_security == "ssl":
                connection = smtplib.SMTP_SSL(**common, context=context)
            else:
                connection = smtplib.SMTP(**common)
                connection.ehlo_or_helo_if_needed()
                # No plaintext authentication or fallback if STARTTLS is not supported.
                connection.starttls(context=context)
                connection.ehlo_or_helo_if_needed()
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
