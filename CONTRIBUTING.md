# Contributing to PRAMAAN

Thanks for contributing! PRAMAAN is a team project — four developers working
in parallel on different modules — so we keep the workflow simple,
reviewable, and safe for `main`.

> **`main` is protected — never push to it directly.**
> All changes go through a feature branch and a Pull Request reviewed by at
> least one teammate. Branch protection is enforced on GitHub.

---

## 1. Prerequisites

- **Git** (any recent version)
- **Node.js 22+** and **npm** — for the frontend
- **Python 3.12** — for the backend
- **Docker + Docker Compose** — optional, only if you want the full stack
  (PostgreSQL + MinIO + backend + frontend) locally. Not needed for backend
  tests or frontend development.

## 2. Local setup

Clone the repository:

```bash
git clone https://github.com/sPreetham42/Pramaan.git
cd Pramaan
```

Backend (Python 3.12):

```bash
cd backend
python -m venv .venv

# Windows:
.venv/Scripts/pip install -r requirements-dev.txt
# Linux/macOS:
# .venv/bin/pip install -r requirements-dev.txt
```

`requirements-dev.txt` includes the runtime requirements, so this is all
you need.

Frontend:

```bash
cd frontend
npm install
```

## 3. Environment variables

Development defaults work out of the box — you only need a `.env` to
override them:

```bash
cp .env.example .env
```

- The backend reads `.env` from the repository root
  (`backend/app/config.py`, via pydantic-settings).
- Docker Compose substitutes the same variables in `docker-compose.yml`.
- **Never commit `.env`** — see [Security rules](#17-security-rules).

## 4. Run the backend

```bash
cd backend
# Windows:
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
# Linux/macOS:
# .venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs · Health check: http://localhost:8000/health

## 5. Run the frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:5173 — the dev server proxies `/api` and `/health` to
the backend on `:8000`.

## 6. Run tests

```bash
cd backend
.venv/Scripts/python -m pytest
```

Tests are **hermetic by default** (in-memory SQLite, stubbed storage
probes) — they run anywhere without PostgreSQL or MinIO. To exercise a real
database, set `DATABASE_URL` (see README).

## 7. Run linting

```bash
cd frontend
npm run lint
```

The frontend uses oxlint. The backend has no linter configured yet — run the
test suite and keep new code consistent with the existing style.

## 8. Build the frontend

```bash
cd frontend
npm run build
```

Runs the TypeScript typecheck (`tsc -b`) plus the Vite production build.
This is also what CI runs.

## 9. Create a feature branch

Always start from an up-to-date `main`:

```bash
git checkout main
git pull origin main
git checkout -b <branch-name>
```

## 10. Branch naming conventions

- `feat/<short-description>` — new feature
- `fix/<short-description>` — bug fix
- `docs/<short-description>` — documentation
- `refactor/<short-description>` — restructuring, no behavior change
- `test/<short-description>` — tests
- `chore/<short-description>` — maintenance (deps, tooling, CI)

Examples: `feat/challenge-list`, `fix/health-timeout`, `docs/architecture`.

## 11. Commit conventions

Write clear, imperative commit messages with a conventional prefix:

```text
feat: add challenge list page
fix: correct /health timeout handling
docs: explain the pilot protocol flow
```

- One logical change per commit.
- Keep changes focused on your task — do not modify unrelated code, and
  respect module ownership (see [`CONTEXT.md`](CONTEXT.md)).

## 12. Pull Request workflow

1. Push your branch:

   ```bash
   git push origin <branch-name>
   ```

2. Open a Pull Request **into `main`** on GitHub. The PR template guides
   you: summary, what changed, why, how it was tested, breaking changes,
   and the checklist.
3. **CI runs automatically** on the PR (backend tests + frontend
   lint/build). Make sure it is green before requesting review.
4. Request a review from a teammate.

## 13. Code review expectations

- **At least one teammate reviews every PR before it is merged.**
- Reviewers check: scope matches the PR, tests pass, no secrets committed,
  no unrelated changes, docs updated when behavior changes.
- Address feedback with follow-up commits pushed to the same branch, then
  request review again.
- Keep PRs small — they are easier to review and faster to get merged.

## 14. Merge expectations

- A PR is merged only after **approval** and **green CI** (enforced by
  branch protection on `main`).
- Merge through the GitHub UI, then **delete the branch** to keep the
  repository tidy.
- Never merge your own PR without a teammate review.

## 15. Reporting bugs

Use the **Bug report** issue template
(`.github/ISSUE_TEMPLATE/bug_report.md`). Include:

- Steps to reproduce
- Expected vs. actual behavior
- Screenshots / logs where helpful
- Environment details (browser/OS, frontend or backend)

## 16. Proposing features

Use the **Feature request** issue template. State:

- The problem you are trying to solve
- The solution you have in mind
- Which PRAMAAN module it belongs to (see the work division in
  [`CONTEXT.md`](CONTEXT.md))

Discuss big ideas before implementing them — respect other developers'
modules.

## 17. Security rules

- **Never report security vulnerabilities publicly** through Issues or PRs.
  See [`SECURITY.md`](SECURITY.md) for how to report privately.
- **Never commit secrets, API keys, credentials, `.env` files, database
  dumps, or private/personal data** — not even "temporarily".
- If you believe a secret was committed, tell the repository owner
  immediately so it can be revoked/rotated. Deleting the file is not
  enough — it remains in Git history.

## 18. Secrets — explicit warning

> ⚠️ **NEVER commit:**
>
> - `.env` files (or any `.env.*` except `.env.example`)
> - API keys, tokens, passwords, private keys
> - Database dumps or backups containing real data
> - Personal/private data of any user
> - Logs that may contain credentials
>
> `.gitignore` already covers the common cases. Before every commit, run
> `git status` and `git diff` and review exactly what you are adding. If a
> file looks sensitive, it probably is — leave it out.

## CI

Pull Requests and pushes to `main` run the CI workflow
(`.github/workflows/ci.yml`): backend tests, frontend lint, frontend build.
**CI must pass before a PR can be merged.**

## Questions?

Read [`CONTEXT.md`](CONTEXT.md) first — it holds the project context, the
non-negotiable product principles, and the team work division. For
day-to-day commands and repository layout, see
[`docs/development.md`](docs/development.md).