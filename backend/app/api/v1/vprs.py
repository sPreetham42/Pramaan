from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Vpr
from app.services.audit import verify_chain
from app.services.serializers import vpr_out

vprs_router = APIRouter(prefix="/vprs", tags=["records"])


@vprs_router.get("")
def list_vprs(db: Session = Depends(get_db)) -> dict:
    rows = db.execute(select(Vpr).order_by(Vpr.issued_at.desc())).scalars().all()
    return {
        "vprs": [
            {
                "id": v.id,
                "reference": v.reference,
                "status": v.status.value,
                "summary": v.summary,
                "issued_at": v.issued_at,
                "startup": v.verdict.pilot.startup.name,
                "department": v.verdict.pilot.challenge.department.short_name,
                "department_name": v.verdict.pilot.challenge.department.name,
                "challenge": v.verdict.pilot.challenge.title,
                "outcome": v.verdict.outcome.value,
                "observed_value": float(v.verdict.observed_value),
                "target_value": float(v.verdict.target_value),
                "unit": v.verdict.unit,
            }
            for v in rows
        ]
    }


@vprs_router.get("/{vpr_id}")
def get_vpr(vpr_id: int, db: Session = Depends(get_db)) -> dict:
    vpr = db.get(Vpr, vpr_id)
    if vpr is None:
        raise HTTPException(status_code=404, detail="Verified Pilot Record not found.")
    return vpr_out(db, vpr)


@vprs_router.get("/{vpr_id}/audit-verify")
def audit_verify(vpr_id: int, db: Session = Depends(get_db)) -> dict:
    vpr = db.get(Vpr, vpr_id)
    if vpr is None:
        raise HTTPException(status_code=404, detail="Verified Pilot Record not found.")
    return verify_chain(db, vpr.verdict.pilot)
