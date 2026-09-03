"""Evidence handling: artifacts are stored through the storage abstraction,
hashed server-side with SHA-256 at upload, and later verified by recomputing
the hash over the stored bytes. Storage may be MinIO or the local demo
directory; the backend records which one so the UI is never dishonest about
where the bytes live.
"""

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Evidence, EvidenceCheck, Measurement, Pilot, PilotStatus
from app.services.audit import append_audit
from app.storage import load_artifact, sha256_hex, store_artifact


def _now(at: datetime | None) -> datetime:
    return at or datetime.now(timezone.utc)


def upload_evidence(
    db: Session,
    pilot: Pilot,
    *,
    title: str,
    kind: str,
    description: str,
    source: str,
    occurred_on: date,
    filename: str,
    content: bytes,
    content_type: str,
    measurement_id: Optional[int] = None,
    actor: str = "Department evaluation cell",
    at: datetime | None = None,
) -> Evidence:
    if pilot.status not in (PilotStatus.RUNNING, PilotStatus.COMPLETED):
        raise HTTPException(
            status_code=409,
            detail="Evidence can only be submitted while the pilot is running or completed.",
        )
    if pilot.verdict is not None:
        raise HTTPException(
            status_code=409, detail="A verdict has been issued; evidence is closed."
        )
    if not content:
        raise HTTPException(status_code=422, detail="The uploaded file is empty.")
    if measurement_id is not None:
        measurement = db.get(Measurement, measurement_id)
        if measurement is None or measurement.pilot_id != pilot.id:
            raise HTTPException(status_code=422, detail="Unknown measurement for this pilot.")

    stored_name, backend = store_artifact(content, content_type)
    digest = sha256_hex(content)
    evidence = Evidence(
        pilot_id=pilot.id,
        measurement_id=measurement_id,
        kind=kind or "report",
        title=title,
        description=description,
        source=source,
        occurred_on=occurred_on,
        filename=filename,
        stored_name=stored_name,
        content_type=content_type or "application/octet-stream",
        size_bytes=len(content),
        sha256=digest,
        storage_backend=backend,
    )
    db.add(evidence)
    db.flush()
    # Self-check at upload: the stored bytes must match what was hashed.
    db.add(
        EvidenceCheck(
            evidence_id=evidence.id,
            ok=True,
            method="sha256",
            note="Hash recorded at upload; stored bytes matched.",
        )
    )
    append_audit(
        db, pilot, "evidence",
        f"Evidence submitted: {title} ({filename}, SHA-256 {digest[:12]}, "
        f"{backend} storage).",
        actor=actor, occurred_at=_now(at),
    )
    db.commit()
    db.refresh(evidence)
    return evidence


def verify_evidence(
    db: Session, evidence: Evidence, actor: str = "System verification", at: datetime | None = None
) -> dict:
    """Recompute the SHA-256 over the stored artifact and compare with the
    hash recorded at upload. Always appends a check record; never mutates
    the artifact itself."""
    data = load_artifact(evidence.storage_backend, evidence.stored_name)
    if data is None:
        ok, note, computed = False, "Stored artifact could not be read for verification.", None
    else:
        computed = sha256_hex(data)
        ok = computed == evidence.sha256
        note = (
            "Stored bytes match the recorded SHA-256."
            if ok
            else "INTEGRITY FAILURE: stored bytes differ from the recorded SHA-256."
        )
    check = EvidenceCheck(
        evidence_id=evidence.id,
        ok=ok,
        method="sha256",
        note=note,
        checked_at=_now(at),
    )
    db.add(check)
    append_audit(
        db, evidence.pilot, "evidence",
        f"Evidence integrity verification {'PASSED' if ok else 'FAILED'}: {evidence.title}.",
        actor=actor, occurred_at=_now(at),
    )
    db.commit()
    db.refresh(check)
    return {
        "ok": ok,
        "method": "sha256",
        "recorded_hash": evidence.sha256,
        "computed_hash": computed,
        "note": note,
        "storage_backend": evidence.storage_backend,
        "checked_at": check.checked_at,
    }


def all_evidence_verified(db: Session, pilot: Pilot) -> bool:
    rows = db.execute(
        select(Evidence).where(Evidence.pilot_id == pilot.id)
    ).scalars()
    for evidence in rows:
        if not evidence.checks or not evidence.checks[-1].ok:
            return False
    return bool(pilot.evidence)
