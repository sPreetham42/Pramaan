from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Evidence, Pilot
from app.services import evidence as evidence_service
from app.services.serializers import evidence_out
from app.storage import load_artifact

evidence_router = APIRouter(prefix="/evidence", tags=["evidence"])
pilot_evidence_router = APIRouter(prefix="/pilots", tags=["evidence"])


def _evidence_or_404(db: Session, evidence_id: int) -> Evidence:
    evidence = db.get(Evidence, evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found.")
    return evidence


@evidence_router.get("")
def list_evidence(db: Session = Depends(get_db)) -> dict:
    rows = db.execute(
        select(Evidence).order_by(Evidence.uploaded_at.desc())
    ).scalars().all()
    return {
        "evidence": [
            {
                **evidence_out(e),
                "pilot_id": e.pilot_id,
                "pilot_status": e.pilot.status.value,
                "challenge": e.pilot.challenge.title,
                "department": e.pilot.challenge.department.short_name,
                "startup": e.pilot.startup.name,
            }
            for e in rows
        ]
    }


@evidence_router.get("/{evidence_id}")
def get_evidence(evidence_id: int, db: Session = Depends(get_db)) -> dict:
    return evidence_out(_evidence_or_404(db, evidence_id))


@evidence_router.get("/{evidence_id}/download")
def download_evidence(evidence_id: int, db: Session = Depends(get_db)) -> Response:
    evidence = _evidence_or_404(db, evidence_id)
    data = load_artifact(evidence.storage_backend, evidence.stored_name)
    if data is None:
        raise HTTPException(
            status_code=410,
            detail="The stored artifact is unavailable for download in this environment.",
        )
    return Response(
        content=data,
        media_type=evidence.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{evidence.filename}"'
            )
        },
    )


@evidence_router.post("/{evidence_id}/verify")
def verify_evidence(evidence_id: int, db: Session = Depends(get_db)) -> dict:
    evidence = _evidence_or_404(db, evidence_id)
    return evidence_service.verify_evidence(db, evidence)


@pilot_evidence_router.post("/{pilot_id}/evidence", status_code=201)
def upload_evidence(
    pilot_id: int,
    file: UploadFile = File(...),
    title: str = Form(...),
    kind: str = Form("report"),
    description: str = Form(""),
    source: str = Form(""),
    occurred_on: Optional[date] = Form(None),
    measurement_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
) -> dict:
    pilot = db.get(Pilot, pilot_id)
    if pilot is None:
        raise HTTPException(status_code=404, detail="Pilot not found.")
    content = file.file.read()
    evidence = evidence_service.upload_evidence(
        db, pilot,
        title=title,
        kind=kind,
        description=description,
        source=source,
        occurred_on=occurred_on or date.today(),
        filename=file.filename or "evidence.bin",
        content=content,
        content_type=file.content_type or "application/octet-stream",
        measurement_id=measurement_id,
    )
    return {"evidence": evidence_out(evidence)}
