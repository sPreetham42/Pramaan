from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Pilot, Validation, ValidationStatus
from app.services import workflow
from app.services.serializers import pilot_out, protocol_out

pilots_router = APIRouter(prefix="/pilots", tags=["pilots"])


def _pilot_or_404(db: Session, pilot_id: int) -> Pilot:
    pilot = db.get(Pilot, pilot_id)
    if pilot is None:
        raise HTTPException(status_code=404, detail="Pilot not found.")
    return pilot


@pilots_router.get("")
def list_pilots(db: Session = Depends(get_db)) -> dict:
    pilots = db.execute(select(Pilot).order_by(Pilot.id)).scalars().all()
    from app.services.serializers import pilot_brief

    return {"pilots": [pilot_brief(p) for p in pilots]}


@pilots_router.get("/{pilot_id}")
def get_pilot(pilot_id: int, db: Session = Depends(get_db)) -> dict:
    return pilot_out(db, _pilot_or_404(db, pilot_id))


class ProtocolDraftRequest(BaseModel):
    metric: str = Field(min_length=3)
    target_operator: str
    target_value: float
    unit: str
    duration_days: int = Field(ge=1)
    sample_interval: str = "weekly"
    measurement_method: str
    success_rule: Optional[str] = None


@pilots_router.put("/{pilot_id}/protocol")
def update_protocol_draft(
    pilot_id: int, body: ProtocolDraftRequest, db: Session = Depends(get_db)
) -> dict:
    pilot = _pilot_or_404(db, pilot_id)
    protocol = workflow.save_protocol_draft(db, pilot, body.model_dump())
    return {"protocol": protocol_out(protocol)}


@pilots_router.post("/{pilot_id}/protocol/approve")
def approve_protocol(pilot_id: int, db: Session = Depends(get_db)) -> dict:
    pilot = _pilot_or_404(db, pilot_id)
    protocol = workflow.approve_protocol(db, pilot)
    return {"status": pilot.status.value, "protocol": protocol_out(protocol)}


@pilots_router.post("/{pilot_id}/protocol/seal")
def seal_protocol(pilot_id: int, db: Session = Depends(get_db)) -> dict:
    pilot = _pilot_or_404(db, pilot_id)
    protocol = workflow.seal_protocol(db, pilot)
    return {"status": pilot.status.value, "protocol": protocol_out(protocol)}


@pilots_router.post("/{pilot_id}/protocol/versions")
def new_protocol_version(pilot_id: int, db: Session = Depends(get_db)) -> dict:
    pilot = _pilot_or_404(db, pilot_id)
    protocol = workflow.new_protocol_version(db, pilot)
    return {"protocol": protocol_out(protocol)}


@pilots_router.post("/{pilot_id}/start")
def start_pilot(pilot_id: int, db: Session = Depends(get_db)) -> dict:
    pilot = workflow.start_pilot(db, _pilot_or_404(db, pilot_id))
    return {"status": pilot.status.value}


class MeasurementRequest(BaseModel):
    label: str
    value: float
    recorded_on: date
    source: str = ""


@pilots_router.post("/{pilot_id}/measurements")
def record_measurement(
    pilot_id: int, body: MeasurementRequest, db: Session = Depends(get_db)
) -> dict:
    pilot = _pilot_or_404(db, pilot_id)
    measurement = workflow.add_measurement(
        db, pilot,
        label=body.label, value=body.value, source=body.source,
        recorded_on=body.recorded_on,
    )
    return {
        "measurement": {
            "id": measurement.id,
            "label": measurement.label,
            "value": float(measurement.value),
            "recorded_on": measurement.recorded_on,
        }
    }


@pilots_router.post("/{pilot_id}/close")
def close_measurements(pilot_id: int, db: Session = Depends(get_db)) -> dict:
    pilot = workflow.close_measurements(db, _pilot_or_404(db, pilot_id))
    return {"status": pilot.status.value}


@pilots_router.get("/{pilot_id}/result")
def provisional_result(pilot_id: int, db: Session = Depends(get_db)) -> dict:
    pilot = _pilot_or_404(db, pilot_id)
    sealed = workflow.current_sealed(pilot)
    if sealed is None or not pilot.measurements:
        raise HTTPException(
            status_code=409,
            detail="Result becomes available once the protocol is sealed and measurements exist.",
        )
    return workflow.compute_result(db, pilot)


class ValidationRequest(BaseModel):
    validator_name: str


@pilots_router.post("/{pilot_id}/validation")
def open_validation(
    pilot_id: int, body: ValidationRequest, db: Session = Depends(get_db)
) -> dict:
    pilot = _pilot_or_404(db, pilot_id)
    validation = workflow.request_validation(db, pilot, body.validator_name)
    return {"validation": {"id": validation.id, "status": validation.status.value}}


class ValidationApproveRequest(BaseModel):
    notes: str = ""


@pilots_router.post("/{pilot_id}/validation/approve")
def approve_validation(
    pilot_id: int, body: ValidationApproveRequest, db: Session = Depends(get_db)
) -> dict:
    pilot = _pilot_or_404(db, pilot_id)
    pending = db.execute(
        select(Validation).where(
            Validation.pilot_id == pilot.id,
            Validation.status == ValidationStatus.PENDING,
        )
    ).scalar_one_or_none()
    if pending is None:
        raise HTTPException(status_code=409, detail="No pending validation for this pilot.")
    validation = workflow.approve_validation(db, pilot, pending, body.notes)
    return {"validation": {"id": validation.id, "status": validation.status.value}}


class VerdictRequest(BaseModel):
    issued_by: str


@pilots_router.post("/{pilot_id}/verdict")
def issue_verdict(
    pilot_id: int, body: VerdictRequest, db: Session = Depends(get_db)
) -> dict:
    pilot = _pilot_or_404(db, pilot_id)
    workflow.issue_verdict(db, pilot, body.issued_by)
    # The verdict/VPR rows were created this request; drop cached
    # relationships so the response reflects the just-issued state.
    db.expire(pilot)
    db.refresh(pilot)
    return pilot_out(db, pilot)
