# Cashbook Management System

`main` combines the database, FastAPI backend and React frontend. The three development branches remain available; deploy from `main`.

- `database/db_init.sql`: fresh PostgreSQL schema (not an upgrade migration).
- `backend/`: API, permissions, transactions/version history and private attachments.
- `frontend/`: guided mobile entry and admin workspace.
- `deploy/`: Lightsail Docker deployment, HTTPS proxy, S3 configuration and backup script.

## Deploy to AWS

Start with [the client access checklist](deploy/CLIENT_CHECKLIST.md), then follow [the deployment runbook](deploy/README.md).

Target: Mumbai, fresh database, one backend worker, private S3. The repository is prepared for deployment; AWS access, a domain, real S3 verification and a restore drill are still needed. SMS recovery is disabled until a provider is approved. Never seed demo users into production.

## Current local installation

The working Windows installation and startup script are documented in [LOCAL_HANDOFF.md](LOCAL_HANDOFF.md). That script preserves the existing local backend checkout/data. Production uses all code from this merged `main` repository through Docker; it does not copy the local database, state, uploads or passwords.

## Development checks

Install `backend/requirements-dev.txt` in a Python virtual environment. Start a disposable-capable local PostgreSQL server and configure `CASHBOOK_TEST_ADMIN_DSN`, then run `python -m pytest` from `backend/`. Tests create a random database and drop it afterward; never point them at a production administrator connection.

From `frontend/`: `npm ci` then `npm run build`. No Android SDK is required for the website.
