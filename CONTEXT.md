# PRAMAAN — Project Context

> Master context file for PRAMAAN developers and AI coding agents.
> This is a **context/reference** file — not an implementation plan and not
> a running task list. Do not overwrite or pad it with status updates; a
> separate `STATUS.md` can be introduced later if the team needs one.
> Update this file only when a genuine architectural or project-level
> decision changes.

## 1. Project identity

**PRAMAAN** · **Prove Once. Reuse the Proof.** · SIH26136

PRAMAAN is an offline-first, self-contained Smart India Hackathon (SIH)
prototype. A government department defines a problem with measurable
success criteria, selects a startup through evaluation, runs a **sealed,
evidence-collecting pilot**, and obtains a **Verified Pilot Record (VPR)** —
a tamper-evident, independently validated proof that can be reused to
support procurement decisions without re-running the pilot.

## 2. Final product lifecycle

```text
Government Problem
→ Startup Discovery
→ Human Evaluation
→ Protocol
→ Seal
→ Pilot
→ Evidence
→ Independent Validation
→ Deterministic Verdict
→ VPR
→ Reuse
→ Procurement Support
```

The central innovation:

**Define success → lock it → run the pilot → verify evidence → preserve the
proof → enable reuse.**

## 3. Non-negotiable principles

- Success criteria (KPIs, baselines, targets) are **locked before the pilot**.
- Sealed records are never silently modified; changes leave an audit trail.
- Evidence is **tamper-evident** (SHA-256 hashing, hash chains).
- Hashing proves record integrity only — it does **not** prove original
  real-world truth.
- An **independent validation** step exists, separate from the pilot runner.
- Verdicts are **deterministic**: reproducible from pre-committed criteria
  and verified evidence.
- AI stays **outside the authoritative decision path**.
- **Failed pilots are preserved** as honest records — they are still proof.
- VPRs are **reusable** assets, not one-off reports.
- Procurement authority remains with government officials; PRAMAAN supports
  decisions but **does not award procurement**.
- Avoid over-engineering — this is a self-contained SIH prototype.

## 4. Final technology decisions

- Frontend: React + TypeScript + Tailwind CSS + Vite
- Backend: FastAPI (Python), single service with logical modules
- Database: PostgreSQL
- Object storage: MinIO
- API: REST (versioned namespace `/api/v1`)
- Integrity: SHA-256 + hash chain
- AI: optional, local only (e.g. Ollama) — never required for the demo
- Local orchestration: Docker Compose (frontend, backend, postgres, minio)
- No microservices, Kubernetes, Kafka, blockchain, or other heavy infra

## 5. SIH demo model

The eventual demo shows two perspectives via a **simple demo role switcher** —
no login, passwords, OAuth, or sessions; production authentication is
explicitly out of scope for the SIH demo.

- **Government Executive:** Problem → Startup → Evaluation → Pilot →
  Verification → VPR → Reuse
- **Startup Founder:** Challenge → Application → Pilot → Evidence →
  Validation → VPR

The demo runs on a **SIMULATED case study** (Karnataka Health Department /
OPD waiting time / Pravaah Health Systems) and must always be labelled as
demonstration data, never presented as a real government pilot.

## 6. Team ownership

- **Person 1 — Project Owner:** foundation now; integration, final polish
  and demo stability later.
- **Person 2 — Government Workflow:** Challenge → Startup → Application →
  Evaluation → Selection.
- **Person 3 — Trust Core:** Protocol → Seal → Pilot → Evidence →
  Validation → Verdict.
- **Person 4 — VPR / Reuse:** VPR → Reuse → Procurement Support → AI →
  Mock Integrations.

Respect module ownership: do not implement another developer's module.

## 7. Current phase

**CURRENT PHASE: FOUNDATION**

The repository provides the technical base only. **NOT IMPLEMENTED YET:**

- Government workflow
- Trust core
- VPR / reuse
- AI
- Integrations (real or mock)

Do not claim any unfinished feature exists. What does work today: the four
Docker Compose services, `GET /` and `GET /health` (reports PostgreSQL and
MinIO reachability), PostgreSQL/MinIO wiring, a minimal React page calling
the backend through a centralized API client, and the pytest foundation.

## 8. Future architecture

```text
React (frontend)
   ↓ REST
FastAPI (backend, one service)
   ↓
PostgreSQL + MinIO
```

The backend will eventually contain **logical modules** (Challenge, Startup,
Evaluation, Protocol, Sealing, Pilot, Evidence, Validation, Verdict, VPR,
Reuse, Procurement, Audit, AI, Adapters) inside the one FastAPI service.
These are future work and must **not** be implemented during the foundation
phase.

## 9. AI boundary

- AI **may assist with**: KPI suggestions, protocol suggestions, similar-VPR
  discovery, evidence summaries.
- AI must **NOT**: select startups, modify sealed criteria, generate official
  verdicts, or approve procurement.

## 10. Agent instructions

Before modifying PRAMAAN:

1. Read CONTEXT.md.
2. Inspect the current repository.
3. Determine the current implementation phase.
4. Respect team/module ownership.
5. Do not redesign finalized architecture.
6. Do not implement another developer's module.
7. Do not add forbidden infrastructure.
8. Do not assume future features are implemented.
9. Keep changes focused.
10. Preserve PRAMAAN's core trust principles.
