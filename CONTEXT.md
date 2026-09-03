# PRAMAAN — Project Context

> Master context file for PRAMAAN developers and AI coding agents.
> Concise project-level reference — not an implementation plan or TODO list.

## What PRAMAAN is

**PRAMAAN = "Prove Once. Reuse the Proof."**

An offline-first, self-contained SIH (Smart India Hackathon) demonstration:
a government department publishes a problem, a startup is selected through
evaluation, a **protocol** is agreed and **sealed** in advance, a pilot runs,
**evidence** is collected with integrity verification, an **independent
validation** produces a **deterministic verdict**, and the outcome becomes a
**Verified Pilot Record (VPR)** that supports **reuse assessment** and
**procurement** decisions.

The core mechanism:

```text
Government Problem → Startup → Evaluation → Protocol
→ SEAL → Pilot → Evidence → Validation → Verdict
→ Verified Pilot Record → Reuse → Procurement Support
```

The most important chain: **SEAL → EVIDENCE → VALIDATION → VERDICT → VPR → REUSE**.

## Final architecture

```text
Browser
   ↓
React + TypeScript + Tailwind (Vite)
   ↓ REST
FastAPI (one backend, logical modules, no microservices)
   ↓            ↓
PostgreSQL     MinIO (evidence files)
```

Future logical modules (inside the single backend): Challenge, Startup,
Evaluation, Protocol, Sealing, Pilot, Evidence, Validation, Verdict, VPR,
Reuse, Procurement, Audit, AI, Adapters (mock integrations).

## Non-negotiable product principles

- **Deterministic trust**: verdicts must be reproducible from
  pre-committed protocols, sealed evidence and hashes — no black-box
  judgment calls at the core.
- **Prove once, reuse the proof**: a verified pilot outcome must be
  reusable for procurement support without re-running the pilot.
- **Offline-first and self-contained**: the SIH demonstration must run
  locally via `docker compose up --build` with no external services.
- **No fake claims**: the demo runs on a **SIMULATED case study** labelled
  as demonstration data — never presented as a real government pilot.
- Simplicity for a prototype: no microservices/Kubernetes/Kafka/blockchain.

### Simulated demo scenario (later)

Karnataka Health Department · excessive OPD waiting time · baseline 42 min ·
KPI: registration-to-consultation waiting time · target ≤ 25 min · pilot:
2 hospitals / 30 days · startup: Pravaah Health Systems.

## Team division

| # | Role | Current | Later owner |
| --- | --- | --- | --- |
| 1 | Project owner | **Foundation** (this) | Integration, final UI/polish, demo stability |
| 2 | Developer | — | **Government workflow**: Challenge → Startup → Application → Evaluation → Selection |
| 3 | Developer | — | **Trust core**: Protocol → Seal → Pilot → Evidence → Validation → Verdict |
| 4 | Developer | — | **VPR/Reuse**: VPR → VPR library → Reuse assessment → Procurement support → AI → mock integrations |

Each developer works independently on top of this foundation; the backend
stays **one service** with logical modules.

## Current status — FOUNDATION complete

Working today:

- Docker Compose starts exactly 4 services: `frontend`, `backend`,
  `postgres`, `minio`.
- FastAPI exposes `GET /` and `GET /health`; `/health` reports PostgreSQL
  and MinIO reachability.
- SQLAlchemy engine/session layer + declarative base exist; **no domain
  tables yet**.
- MinIO bucket `pramaan-evidence` is created at startup; storage config is
  ready for evidence files.
- React + TS (strict) + Tailwind page shows the PRAMAAN tagline, confirms
  "Foundation build is running", and calls `/health` through the
  centralized API client (`frontend/src/api/client.ts`).
- Basic backend tests pass (`backend/tests/`).

## What future developers will implement (not now)

- **Person 2** — challenges, applications, startups, evaluations,
  pilot-selection workflow. Backend: `backend/app/api|models|schemas|services`
  under `/api/v1`; frontend pages under `frontend/src/pages`.
- **Person 3** — protocol definition + sealing, pilot tracking, evidence
  upload (MinIO) + SHA-256 hashing, integrity validation, deterministic
  verdict. Trust logic in `backend/app/services`; storage via
  `backend/app/storage.py`.
- **Person 4** — VPR records + library, reuse assessment, procurement
  support, optional AI via a local model (Ollama), mock integrations.
  Adapters under `backend/app/` following the storage-adapter pattern.

## Explicitly NOT implemented during foundation

No challenges/startups/applications/evaluations/protocols/sealing/pilots/
evidence/hash chains/validation/verdicts/VPR/reuse/procurement/AI/
government integrations/authentication (no OAuth, login, passwords, RBAC,
sessions). No microservices, Kubernetes, Kafka, blockchain, payments.
No real government APIs and no production deployment.

## For AI coding agents working in this repo

1. Read this file first, then the relevant section of the codebase.
2. Do not redesign the product or swap the stack (React+TS+Tailwind+Vite /
   FastAPI / PostgreSQL / MinIO / Docker Compose).
3. Backend rules: business logic goes in `services/`, not route handlers;
   routers mount under `/api/v1` in `app/main.py`; models inherit
   `app/db/base.Base` and use the `get_db` dependency; env config belongs in
   `app/config.py` (never hardcode credentials).
4. Frontend rules: no raw `fetch()` in components — extend
   `frontend/src/api/client.ts`; shared UI lives in `frontend/src/components`;
   pages in `frontend/src/pages`; strict TypeScript.
5. Keep everything runnable with `docker compose up --build`; do not add
   services or heavyweight infrastructure to the prototype.
6. Mark demo scenario data explicitly as SIMULATED.
7. Test framework: `backend/tests/` (pytest). Add tests with each module.
