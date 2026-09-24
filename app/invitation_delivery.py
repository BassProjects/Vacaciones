"""Read the latest invitation from the durable outbox, without resending it."""

from sqlalchemy import or_, select

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
    ids = [row["userId"] for row in rows]
    keys = ["invite:" + identifier for identifier in ids]
    messages = {}
    query = (
        select(Outbox)
        .where(
            Outbox.event_key.startswith("invite:"),
            or_(Outbox.event_key.in_(keys), Outbox.context["user_id"].astext.in_(ids)),
        )
        .order_by(Outbox.created_at.desc(), Outbox.id.desc())
    )
    for item in db.scalars(query):
        identifier = item.context.get("user_id") or item.event_key.split(":")[1]
        messages.setdefault(identifier, item)
    for row in rows:
        row.update(delivery_state(messages.get(row["userId"])))
