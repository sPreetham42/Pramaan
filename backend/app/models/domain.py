"""PRAMAAN demo domain model: one coherent government-to-reuse journey.

  Department -> Challenge -> Application -> Startup (eligibility, evaluation)
                         -> Pilot -> Protocol (draft -> approved -> sealed)
                                  -> Milestones (status + payment state)
                                  -> Risks (identified, mitigation)
                                  -> Measurement (weekly samples)
                                  -> Evidence (artifacts + integrity checks)
                                  -> Validation (human sign-off)
                                  -> Verdict -> ScaleDecision -> VPR
  Challenge (second department) -> ReuseDecision -> VPR

Demo-grade by design: deterministic seeded data, plain relational
persistence, and rules enforced in one workflow service so the UI can never
display a state the backend did not produce.
"""

from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def enum_col(enum_cls, name: str, length: int = 32):
    """SQLAlchemy Enum stored as a string (SQLite- and PostgreSQL-safe)."""
    from sqlalchemy import Enum as SAEnum

    return SAEnum(
        enum_cls,
        values_callable=lambda e: [m.value for m in e],
        native_enum=False,
        length=length,
        name=name,
    )


class ChallengeStatus(str, Enum):
    OPEN = "OPEN"            # discovery open, applications under review
    IN_PILOT = "IN_PILOT"    # a pilot has been selected and is being run
    COMPLETED = "COMPLETED"  # verdict reached or evidence accepted for reuse


class ApplicationStatus(str, Enum):
    SUBMITTED = "SUBMITTED"
    INELIGIBLE = "INELIGIBLE"  # screened out against published criteria
    NOT_SELECTED = "NOT_SELECTED"
    SELECTED = "SELECTED"


class PilotStatus(str, Enum):
    SELECTED = "SELECTED"    # winner chosen; protocol still draftable
    SEALED = "SEALED"        # criteria locked before the pilot runs
    RUNNING = "RUNNING"      # measurement window open
    COMPLETED = "COMPLETED"  # measurements closed, awaiting validation/verdict
    VERDICTED = "VERDICTED"  # verdict issued; pilot history immutable


class ProtocolStatus(str, Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    SEALED = "SEALED"


class MilestoneStatus(str, Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"


class PaymentStatus(str, Enum):
    PENDING = "PENDING"              # milestone not yet complete
    PAYMENT_ELIGIBLE = "PAYMENT_ELIGIBLE"  # complete, awaiting validation release
    RELEASED = "RELEASED"            # released against validation/verdict


class ValidationStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class VerdictOutcome(str, Enum):
    MET = "MET"
    NOT_MET = "NOT_MET"


class ScaleOutcome(str, Enum):
    SCALE_UP_RECOMMENDED = "SCALE_UP_RECOMMENDED"
    CONFIRMATORY_RECOMMENDED = "CONFIRMATORY_RECOMMENDED"
    NOT_RECOMMENDED = "NOT_RECOMMENDED"


class VprStatus(str, Enum):
    ACTIVE = "ACTIVE"


class ReuseAction(str, Enum):
    REUSE_EVIDENCE = "REUSE_EVIDENCE"
    CONFIRMATORY_PILOT = "CONFIRMATORY_PILOT"


# ---------------------------------------------------------------------------
# Reference entities


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    short_name: Mapped[str] = mapped_column(String(40), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    challenges: Mapped[list["Challenge"]] = relationship(back_populates="department")


class Startup(Base):
    __tablename__ = "startups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    tagline: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    sector: Mapped[str] = mapped_column(String(100), default="")
    city: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    applications: Mapped[list["Application"]] = relationship(back_populates="startup")


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    status: Mapped[ChallengeStatus] = mapped_column(
        enum_col(ChallengeStatus, "challenge_status"), default=ChallengeStatus.OPEN
    )
    title: Mapped[str] = mapped_column(String(300))
    problem: Mapped[str] = mapped_column(Text)
    expected_outcome: Mapped[str] = mapped_column(Text, default="")
    # The KPI the pilot must demonstrate.
    kpi_metric: Mapped[str] = mapped_column(String(200))
    baseline_value: Mapped[float] = mapped_column(Numeric(10, 2))
    target_value: Mapped[float] = mapped_column(Numeric(10, 2))
    target_operator: Mapped[str] = mapped_column(String(4))  # lt|lte|gt|gte
    unit: Mapped[str] = mapped_column(String(40), default="minutes")
    duration_days: Mapped[int] = mapped_column(default=30)
    # Eligibility and evaluation criteria, published before applications.
    eligibility_criteria: Mapped[list] = mapped_column(JSON, default=list)
    evaluation_dimensions: Mapped[list] = mapped_column(JSON, default=list)
    pilot_expectations: Mapped[str] = mapped_column(Text, default="")
    evidence_requirements: Mapped[list] = mapped_column(JSON, default=list)
    tags: Mapped[list] = mapped_column(JSON, default=list)  # reuse discovery
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    department: Mapped[Department] = relationship(back_populates="challenges")
    applications: Mapped[list["Application"]] = relationship(
        back_populates="challenge", cascade="all, delete-orphan"
    )
    pilots: Mapped[list["Pilot"]] = relationship(
        back_populates="challenge", cascade="all, delete-orphan"
    )


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("challenge_id", "startup_id", name="uq_application_challenge_startup"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id"))
    startup_id: Mapped[int] = mapped_column(ForeignKey("startups.id"))
    status: Mapped[ApplicationStatus] = mapped_column(
        enum_col(ApplicationStatus, "application_status"),
        default=ApplicationStatus.SUBMITTED,
    )
    proposal: Mapped[str] = mapped_column(Text, default="")
    submitted_on: Mapped[date] = mapped_column(Date)
    # Eligibility screening: outcome plus the individual published checks.
    eligible: Mapped[bool] = mapped_column(Boolean, default=False)
    eligibility_checks: Mapped[list] = mapped_column(JSON, default=list)
    screened_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    challenge: Mapped[Challenge] = relationship(back_populates="applications")
    startup: Mapped[Startup] = relationship(back_populates="applications")
    evaluations: Mapped[list["Evaluation"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )


class Evaluation(Base):
    __tablename__ = "evaluations"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"))
    evaluator_name: Mapped[str] = mapped_column(String(200))
    evaluator_role: Mapped[str] = mapped_column(String(200), default="")
    # Overall score plus per-dimension scores with visible reasons.
    score: Mapped[float] = mapped_column(Numeric(3, 1))
    dimensions: Mapped[list] = mapped_column(JSON, default=list)
    summary: Mapped[str] = mapped_column(Text, default="")
    evaluated_on: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    application: Mapped[Application] = relationship(back_populates="evaluations")


# ---------------------------------------------------------------------------
# Trust core: pilot, protocol, milestones, risks, measurements


class Pilot(Base):
    __tablename__ = "pilots"

    id: Mapped[int] = mapped_column(primary_key=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id"))
    startup_id: Mapped[int] = mapped_column(ForeignKey("startups.id"))
    status: Mapped[PilotStatus] = mapped_column(
        enum_col(PilotStatus, "pilot_status"), default=PilotStatus.SELECTED
    )
    scope: Mapped[str] = mapped_column(Text, default="")
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    challenge: Mapped[Challenge] = relationship(back_populates="pilots")
    startup: Mapped[Startup] = relationship()
    protocols: Mapped[list["Protocol"]] = relationship(
        back_populates="pilot",
        cascade="all, delete-orphan",
        order_by="Protocol.version",
    )
    milestones: Mapped[list["PilotMilestone"]] = relationship(
        back_populates="pilot",
        cascade="all, delete-orphan",
        order_by="PilotMilestone.seq",
    )
    risks: Mapped[list["PilotRisk"]] = relationship(
        back_populates="pilot", cascade="all, delete-orphan"
    )
    measurements: Mapped[list["Measurement"]] = relationship(
        back_populates="pilot", cascade="all, delete-orphan"
    )
    evidence: Mapped[list["Evidence"]] = relationship(
        back_populates="pilot", cascade="all, delete-orphan"
    )
    validations: Mapped[list["Validation"]] = relationship(
        back_populates="pilot", cascade="all, delete-orphan"
    )
    audit_events: Mapped[list["AuditEvent"]] = relationship(
        back_populates="pilot",
        cascade="all, delete-orphan",
        order_by="AuditEvent.id",
    )
    verdict: Mapped[Optional["Verdict"]] = relationship(
        back_populates="pilot", cascade="all, delete-orphan", uselist=False
    )


class Protocol(Base):
    __tablename__ = "protocols"
    __table_args__ = (
        UniqueConstraint("pilot_id", "version", name="uq_protocol_pilot_version"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pilot_id: Mapped[int] = mapped_column(ForeignKey("pilots.id"))
    version: Mapped[int] = mapped_column(default=1)
    status: Mapped[ProtocolStatus] = mapped_column(
        enum_col(ProtocolStatus, "protocol_status"), default=ProtocolStatus.DRAFT
    )
    metric: Mapped[str] = mapped_column(String(200))
    target_operator: Mapped[str] = mapped_column(String(4))
    target_value: Mapped[float] = mapped_column(Numeric(10, 2))
    unit: Mapped[str] = mapped_column(String(40))
    # Baseline snapshot taken at seal so the record stands alone.
    baseline_value: Mapped[float] = mapped_column(Numeric(10, 2))
    duration_days: Mapped[int] = mapped_column()
    sample_interval: Mapped[str] = mapped_column(String(60), default="weekly")
    measurement_method: Mapped[str] = mapped_column(Text)
    success_rule: Mapped[str] = mapped_column(Text, default="")
    # SHA-256 over the canonical criteria snapshot; set once at seal time.
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    sealed_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sealed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    pilot: Mapped[Pilot] = relationship(back_populates="protocols")


class PilotMilestone(Base):
    __tablename__ = "pilot_milestones"

    id: Mapped[int] = mapped_column(primary_key=True)
    pilot_id: Mapped[int] = mapped_column(ForeignKey("pilots.id"))
    seq: Mapped[int] = mapped_column()
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    status: Mapped[MilestoneStatus] = mapped_column(
        enum_col(MilestoneStatus, "milestone_status"), default=MilestoneStatus.PENDING
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        enum_col(PaymentStatus, "payment_status"), default=PaymentStatus.PENDING
    )
    note: Mapped[str] = mapped_column(Text, default="")

    pilot: Mapped[Pilot] = relationship(back_populates="milestones")


class PilotRisk(Base):
    __tablename__ = "pilot_risks"

    id: Mapped[int] = mapped_column(primary_key=True)
    pilot_id: Mapped[int] = mapped_column(ForeignKey("pilots.id"))
    category: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    mitigation: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(40), default="MITIGATED")  # IDENTIFIED|MITIGATED|MONITORED

    pilot: Mapped[Pilot] = relationship(back_populates="risks")


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (
        UniqueConstraint("pilot_id", "label", name="uq_measurement_pilot_label"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pilot_id: Mapped[int] = mapped_column(ForeignKey("pilots.id"))
    protocol_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("protocols.id"), nullable=True
    )
    label: Mapped[str] = mapped_column(String(60))  # "Week 1" ...
    value: Mapped[float] = mapped_column(Numeric(10, 2))
    unit: Mapped[str] = mapped_column(String(40), default="minutes")
    source: Mapped[str] = mapped_column(String(300), default="")
    recorded_on: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    pilot: Mapped[Pilot] = relationship(back_populates="measurements")
    protocol: Mapped[Optional[Protocol]] = relationship()


# ---------------------------------------------------------------------------
# Evidence, validation, verdict, records, reuse


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(primary_key=True)
    pilot_id: Mapped[int] = mapped_column(ForeignKey("pilots.id"))
    measurement_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("measurements.id"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(60), default="report")
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(300), default="")
    occurred_on: Mapped[date] = mapped_column(Date)
    filename: Mapped[str] = mapped_column(String(300))
    stored_name: Mapped[str] = mapped_column(String(200), unique=True)
    content_type: Mapped[str] = mapped_column(
        String(120), default="application/octet-stream"
    )
    size_bytes: Mapped[int] = mapped_column(default=0)
    sha256: Mapped[str] = mapped_column(String(64))
    storage_backend: Mapped[str] = mapped_column(
        String(20), default="local"
    )  # local|minio
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    pilot: Mapped[Pilot] = relationship(back_populates="evidence")
    measurement: Mapped[Optional[Measurement]] = relationship()
    checks: Mapped[list["EvidenceCheck"]] = relationship(
        back_populates="evidence",
        cascade="all, delete-orphan",
        order_by="EvidenceCheck.id",
    )


class EvidenceCheck(Base):
    __tablename__ = "evidence_checks"

    id: Mapped[int] = mapped_column(primary_key=True)
    evidence_id: Mapped[int] = mapped_column(ForeignKey("evidence.id"))
    ok: Mapped[bool] = mapped_column(Boolean)
    method: Mapped[str] = mapped_column(String(120), default="sha256")
    note: Mapped[str] = mapped_column(Text, default="")
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    evidence: Mapped[Evidence] = relationship(back_populates="checks")


class Validation(Base):
    __tablename__ = "validations"

    id: Mapped[int] = mapped_column(primary_key=True)
    pilot_id: Mapped[int] = mapped_column(ForeignKey("pilots.id"))
    validator_name: Mapped[str] = mapped_column(String(200))
    status: Mapped[ValidationStatus] = mapped_column(
        enum_col(ValidationStatus, "validation_status"),
        default=ValidationStatus.PENDING,
    )
    notes: Mapped[str] = mapped_column(Text, default="")
    decided_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    pilot: Mapped[Pilot] = relationship(back_populates="validations")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    pilot_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("pilots.id"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(40))
    summary: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(200), default="")
    # SHA-256 chain: content over (kind, summary, actor, prev, occurred_at).
    content_hash: Mapped[str] = mapped_column(String(64))
    prev_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    pilot: Mapped[Optional[Pilot]] = relationship(back_populates="audit_events")


class Verdict(Base):
    __tablename__ = "verdicts"

    id: Mapped[int] = mapped_column(primary_key=True)
    pilot_id: Mapped[int] = mapped_column(ForeignKey("pilots.id"), unique=True)
    protocol_id: Mapped[int] = mapped_column(ForeignKey("protocols.id"))
    protocol_version: Mapped[int] = mapped_column()
    # Criteria snapshot copied from the SEALED protocol at issuance.
    metric: Mapped[str] = mapped_column(String(200))
    target_operator: Mapped[str] = mapped_column(String(4))
    target_value: Mapped[float] = mapped_column(Numeric(10, 2))
    unit: Mapped[str] = mapped_column(String(40))
    observed_value: Mapped[float] = mapped_column(Numeric(10, 2))
    sample_count: Mapped[int] = mapped_column(default=0)
    method: Mapped[str] = mapped_column(Text)
    outcome: Mapped[VerdictOutcome] = mapped_column(
        enum_col(VerdictOutcome, "verdict_outcome")
    )
    issued_by: Mapped[str] = mapped_column(String(200))
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    pilot: Mapped[Pilot] = relationship(back_populates="verdict")
    protocol: Mapped[Protocol] = relationship()
    scale: Mapped[Optional["ScaleDecision"]] = relationship(
        back_populates="verdict", cascade="all, delete-orphan", uselist=False
    )
    vpr: Mapped[Optional["Vpr"]] = relationship(
        back_populates="verdict", cascade="all, delete-orphan", uselist=False
    )


class ScaleDecision(Base):
    __tablename__ = "scale_decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    verdict_id: Mapped[int] = mapped_column(ForeignKey("verdicts.id"), unique=True)
    outcome: Mapped[ScaleOutcome] = mapped_column(enum_col(ScaleOutcome, "scale_outcome"))
    basis: Mapped[str] = mapped_column(Text)
    decided_by: Mapped[str] = mapped_column(String(200))
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    verdict: Mapped[Verdict] = relationship(back_populates="scale")


class Vpr(Base):
    __tablename__ = "vprs"

    id: Mapped[int] = mapped_column(primary_key=True)
    verdict_id: Mapped[int] = mapped_column(ForeignKey("verdicts.id"), unique=True)
    reference: Mapped[str] = mapped_column(String(80), unique=True)
    status: Mapped[VprStatus] = mapped_column(
        enum_col(VprStatus, "vpr_status"), default=VprStatus.ACTIVE
    )
    summary: Mapped[str] = mapped_column(Text, default="")
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    verdict: Mapped[Verdict] = relationship(back_populates="vpr")


class ReuseDecision(Base):
    __tablename__ = "reuse_decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id"))
    vpr_id: Mapped[int] = mapped_column(ForeignKey("vprs.id"))
    action: Mapped[ReuseAction] = mapped_column(enum_col(ReuseAction, "reuse_action"))
    rationale: Mapped[str] = mapped_column(Text, default="")
    decided_by: Mapped[str] = mapped_column(String(200), default="")
    confirmatory_pilot_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("pilots.id"), nullable=True
    )
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    challenge: Mapped[Challenge] = relationship()
    vpr: Mapped[Vpr] = relationship()
    confirmatory_pilot: Mapped[Optional[Pilot]] = relationship()
