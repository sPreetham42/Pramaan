"""Audit trail: every workflow event is recorded against its pilot in a
SHA-256 chain. Each event stores the hash of the previous event, so the
history cannot be reordered or silently altered without breaking the chain.
"""

import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEvent, Pilot


def _hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _naive_utc(value: datetime) -> datetime:
    """Normalise to naive UTC so the hashed form is identical on SQLite
    (which stores naive) and PostgreSQL (which stores tz-aware)."""
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _event_content(event: AuditEvent) -> str:
    return json.dumps(
        {
            "kind": event.kind,
            "summary": event.summary,
            "actor": event.actor,
            "prev": event.prev_hash,
            "at": (
                event.occurred_at.isoformat()
                if event.occurred_at is not None
                else None
            ),
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def append_audit(
    db: Session,
    pilot: Pilot | None,
    kind: str,
    summary: str,
    actor: str = "",
    occurred_at: datetime | None = None,
) -> AuditEvent:
    """Append an event to the pilot's chain (pilot may be None only for
    events outside any pilot, which are not chained)."""
    occurred_at = _naive_utc(occurred_at or datetime.now(timezone.utc))
    prev_hash: str | None = None
    if pilot is not None:
        # The session has autoflush disabled; persist earlier events so the
        # chain link always points at the true previous event.
        db.flush()
        last = db.execute(
            select(AuditEvent)
            .where(AuditEvent.pilot_id == pilot.id)
            .order_by(AuditEvent.id.desc())
            .limit(1)
        ).scalar_one_or_none()
        prev_hash = last.content_hash if last else None

    event = AuditEvent(
        pilot_id=pilot.id if pilot is not None else None,
        kind=kind,
        summary=summary,
        actor=actor,
        prev_hash=prev_hash,
        occurred_at=occurred_at,
    )
    event.content_hash = _hash(_event_content(event))
    db.add(event)
    return event


def verify_chain(db: Session, pilot: Pilot) -> dict:
    """Recompute every event hash in order and confirm the links hold."""
    events = list(
        db.execute(
            select(AuditEvent)
            .where(AuditEvent.pilot_id == pilot.id)
            .order_by(AuditEvent.id)
        ).scalars()
    )
    expected_prev: str | None = None
    failures: list[str] = []
    for event in events:
        if event.prev_hash != expected_prev:
            failures.append(f"event {event.id}: broken link")
            break
        if event.content_hash != _hash(_event_content(event)):
            failures.append(f"event {event.id}: content hash mismatch")
            break
        expected_prev = event.content_hash
    return {"ok": not failures, "count": len(events), "issues": failures}
