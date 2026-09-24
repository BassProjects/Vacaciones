"""Read invitation delivery from the durable outbox; never resend during a status check."""

from sqlalchemy import select

from app.models import Outbox


def delivery_state(item):
    status = item.status if item else "not_queued"
    return {
        "mailId": item.id if item else None,
        "mailStatus": status,
        "mailSent": status == "sent",
        "mailQueued": status in {"pending", "sending"},
        "mailError": item.last_error if item else None,
    }


def attach_delivery(db, rows):
    """Attach the existing invitation's state without changing any account or message."""
    keys = ["invite:" + row["userId"] for row in rows]
    messages = {
        item.event_key: item
        for item in db.scalars(select(Outbox).where(Outbox.event_key.in_(keys)))
    }
    for row in rows:
        row.update(delivery_state(messages.get("invite:" + row["userId"])))
