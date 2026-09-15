# Office Cashbook

A small-office cashbook: React (web + Capacitor/Android shell) frontend,
FastAPI backend, PostgreSQL. Three roles (admin, debit_user, credit_user),
four transaction types (credit, debit, payable_credit, payable_debit),
head-tree permissions with inheritance, corrections-as-new-versions,
OTP password recovery via a mock SMS provider (local only), private local
file storage.

## Repository layout

Ordinary branches, one per working area (no worktrees):

- `database_local` — `database/db_init.sql`, schema docs. The authoritative schema.
- `backend_local` — `backend/` FastAPI application and tests.
- `frontend_local` — `frontend/` React application and Capacitor config.

Merge all three into `main` when going to production.

## Running locally (Windows)

Prerequisites: Python 3.13+, Node 20+, a PostgreSQL 17 server (a Docker
container works fine), Docker Desktop if you use the container.

### 1. Database

```bat
docker run -d --name cashbook-pg -e POSTGRES_PASSWORD=cashbook_local ^
  -e POSTGRES_DB=cashbook_dev -p 5433:5432 postgres:17-alpine
```

Initialize the schema (fresh databases only — never run this over a populated DB):

```bat
docker cp database\db_init.sql cashbook-pg:/tmp/db_init.sql
docker exec cashbook-pg psql -U postgres -d cashbook_dev -q -f /tmp/db_init.sql
```

### 2. Backend (port 8000)

```bat
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
.venv\Scripts\python -m app.seed admin123 debit123 credit123
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

`app.seed` refuses to run on a non-empty database. Demo accounts (LOCAL ONLY,
not production secrets):

| Account  | Password  | Role        | Recovery number |
|----------|-----------|-------------|-----------------|
| admin    | admin123  | admin       | 0300-0000001    |
| debit1   | debit123  | debit_user  | 0300-0000002    |
| credit1  | credit123 | credit_user | 0300-0000003    |

### 3. Frontend (port 5173)

```bat
cd frontend
npm install
npx vite --port 5173
```

Open http://localhost:5173 — the dev server proxies `/api` to port 8000.

### Resetting the dev database

```bat
cd backend
.venv\Scripts\python -m app.reset_dev
.venv\Scripts\python -m app.seed admin123 debit123 credit123
```

Then restart the backend so its in-process ID counters and state files re-sync.

## Tests

23 integration tests run against a disposable `cashbook_test` database:

```bat
cd backend
.venv\Scripts\python -m pytest tests -q
```

Covers: sign-in/session enforcement, role-derived transaction types and
direction forgery prevention, admin/read endpoint protection, permission
inheritance, inactive-ancestor blocking, transactionable-flag enforcement,
head-move cycle rejection, move identity preservation, idempotency (including
concurrent duplicates), correction history and stale-edit rejection, concurrent
corrections, deactivation totals and delete semantics, payable grouping,
recovery lifecycle (cooldown, attempts, single-use grant, replay), recovery
number uniqueness, role/password change session invalidation, attachment
ownership, last-admin protection, CSRF.

## Configuration

`backend/.env` (see `.env.example`): DB DSN, session TTL, upload dir, SMS
provider (`mock` only in local env), CORS origins, cookie SameSite.

## Android

See `frontend/ANDROID.md`. Capacitor config and pinned packages are in place;
no APK has been built on this machine (no JDK/Android SDK) — that document
lists exactly what is missing.

## Owner-accepted design decisions

Per instruction, the database schema is frozen — zero additions. The backend
compensates in-process (single-instance app):

- **ID generation**: startup reads `MAX(id)` per table, then allocates from an
  in-process counter. If you insert rows by hand, restart the backend.
- **Idempotency keys**: stored in a local JSON file next to the backend, not
  in the database.
- **Upload draft ownership**: tracked in the same local state file, not in the
  `Images`/`Voice_notes` tables.
- **OTP challenges / reset grants**: in-process state persisted to
  `.otp_state.json`; codes stored as keyed digests only.
- **Recovery number**: the first `Contacts` row per user is the designated
  recovery number; cross-account uniqueness is enforced in the backend.

## Known gaps (deliberate, for later)

- Production deployment (AWS), real SMS provider, S3 storage: see
  `AWS_DEPLOYMENT_INPUTS.md`.
- No APK built or device-tested yet (no Android tooling on this machine).
- Screenshots/UX polish: flows were exercised end-to-end in a browser;
  visual review on real hardware is left to the owner.
