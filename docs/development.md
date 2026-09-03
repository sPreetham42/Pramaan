# PRAMAAN — Developer Guide

A companion to [`CONTRIBUTING.md`](../CONTRIBUTING.md) (workflow) and
[`CONTEXT.md`](../CONTEXT.md) (project context). This page covers the
repository layout and the day-to-day commands.

## Repository structure

```text
frontend/    React 19 + TypeScript (strict) + Tailwind CSS 4 + Vite 8
backend/     FastAPI app — one service, modular folders (api/, db/, models/, schemas/, services/)
database/    Placeholder — future migrations/seed data live here
storage/     Placeholder — future demo evidence files live here
.github/     PR/issue templates, CODEOWNERS placeholder, CI workflow
docs/        Developer documentation
```

## Frontend

- Entry: `frontend/src/main.tsx` → `App.tsx` → `pages/Home.tsx`
- All API calls go through `frontend/src/api/client.ts` — never raw
  `fetch()` scattered in components
- The dev server proxies `/api` and `/health` to the backend on `:8000`
  (Docker uses nginx for the same job)

Commands (run from `frontend/`):

```bash
npm install      # install dependencies (uses package-lock.json)
npm run dev      # dev server on http://localhost:5173
npm run build    # typecheck (tsc -b) + production build into dist/
npm run lint     # oxlint
```

## Backend

- Entry: `backend/app/main.py`
- Config: `backend/app/config.py` — environment variables / `.env`
  (pydantic-settings); never hardcode credentials
- Database: `backend/app/db/` — SQLAlchemy engine + session, centralized
- Routes: `backend/app/api/` — small router modules; domain routers mount
  under `/api/v1`
- Storage: `backend/app/storage.py` — MinIO bootstrap (creates the
  `pramaan-evidence` bucket at startup)

Commands (run from `backend/`):

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000   # Windows
.venv/bin/python -m uvicorn app.main:app --reload --port 8000       # Linux/macOS
.venv/Scripts/python -m pytest                                      # run tests
```

Tests live in `backend/tests/` (pytest). They run hermetically by default —
in-memory SQLite and stubbed storage probes, so no PostgreSQL/MinIO is
needed locally.

## Full stack (Docker Compose)

```bash
docker compose up --build
```

Starts postgres (:5433), minio (:9000/:9001), backend (:8000), frontend
(:5173). Copy `.env.example` to `.env` first if you want to override
defaults.

## Contribution workflow

Branches, commit conventions, Pull Requests, review, and CI are documented
in [`CONTRIBUTING.md`](../CONTRIBUTING.md). Read [`CONTEXT.md`](../CONTEXT.md)
for the product principles and the 4-person module ownership.