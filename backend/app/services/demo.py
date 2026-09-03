"""Demo-only scheduled telemetry. These helpers exist so a presenter can
advance a running pilot week by week with deterministic measurements and
real, hashable evidence artifacts. The values are fixed demo data; the
verdict is still computed from whatever is stored.

The API router guards these endpoints behind ``settings.demo_mode``.
"""

from datetime import date, datetime, timezone, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Measurement, Pilot, PilotStatus
from app.services import evidence as evidence_service
from app.services import workflow

DEMO_ACTOR = "Demo telemetry sync"


def scheduled_values(pilot: Pilot) -> list[float]:
    """Deterministic weekly KPI samples for the demo scenario."""
    protocol = workflow.current_sealed(pilot)
    if protocol is not None and protocol.duration_days <= 14:
        return [24.0, 21.0]  # confirmatory re-measurement pilot
    return [31.0, 26.0, 21.0, 18.0]  # full four-week pilot


def build_sampling_log(pilot: Pilot, label: str, value: float, period_end: date, source: str) -> str:
    protocol = workflow.current_sealed(pilot)
    unit = protocol.unit if protocol is not None else "minutes"
    metric = protocol.metric if protocol is not None else pilot.challenge.kpi_metric
    return (
        "PRAMAAN DEMO SAMPLING LOG\n"
        f"Pilot scope: {pilot.scope}\n"
        f"Measurement period: {label}, ending {period_end.isoformat()}\n"
        f"KPI: {metric}\n"
        f"Aggregate value: {value:g} {unit}\n"
        f"Source system: {source}\n"
        "Method: mean of timestamped registration-to-consultation records "
        "across participating sites, computed from the pilot reporting interface.\n"
        "Note: simulated demonstration artifact for the SIH prototype. "
        "Bytes are real and hashed at upload; content describes a fictional pilot.\n"
    )


def next_demo_week(db: Session, pilot: Pilot, actor: str = DEMO_ACTOR, at: datetime | None = None) -> dict:
    """Record the next scheduled weekly measurement plus its evidence
    artifact, then auto-close the pilot after the final scheduled week."""
    if pilot.status != PilotStatus.RUNNING:
        raise HTTPException(
            status_code=409,
            detail="Scheduled telemetry is only available while the pilot is running.",
        )
    values = scheduled_values(pilot)
    count = db.scalar(
        select(func.count())
        .select_from(Measurement)
        .where(Measurement.pilot_id == pilot.id)
    ) or 0
    if count >= len(values):
        raise HTTPException(
            status_code=409, detail="All scheduled demo weeks are already recorded."
        )
    label = f"Week {count + 1}"
    value = values[count]
    started = pilot.started_at or at or datetime.now(timezone.utc)
    period_end = started.date() + timedelta(weeks=count + 1)
    source = "Pilot site reporting interface (demo telemetry)"

    measurement: Measurement = workflow.add_measurement(
        db, pilot, label=label, value=value, source=source,
        recorded_on=period_end, actor=actor, at=at,
    )
    content = build_sampling_log(
        pilot, label, value, period_end, source
    ).encode("utf-8")
    evidence_service.upload_evidence(
        db, pilot,
        title=f"Week {count + 1} KPI sampling log",
        kind="ops_report",
        description=(
            f"Timestamped sampling log supporting the Week {count + 1} KPI value "
            f"of {value:g} minutes."
        ),
        source=source,
        occurred_on=period_end,
        filename=f"week_{count + 1}_sampling_log.txt",
        content=content,
        content_type="text/plain",
        measurement_id=measurement.id,
        actor=actor,
        at=at,
    )

    total = db.scalar(
        select(func.count())
        .select_from(Measurement)
        .where(Measurement.pilot_id == pilot.id)
    )
    closed = False
    if total >= len(values):
        workflow.close_measurements(db, pilot, actor=actor, at=at)
        closed = True
    return {
        "measurement_id": measurement.id,
        "label": label,
        "value": value,
        "pilot_status": pilot.status.value,
        "closed": closed,
    }
