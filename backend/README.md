# FastAPI backend

Run from this directory using the existing virtual environment:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Configuration comes from the ignored `.env`. Keep one writing backend process. The frontend proxies `/api` to this server; FastAPI routes themselves have no `/api` prefix.

The owner has frozen the PostgreSQL schema. Integer IDs, upload ownership, submission retries, and mock OTP state therefore use the existing single-process/local-file approach. Preserve state files and uploads with database backups. Do not run multiple workers, independently write to the old service on port 8000, or edit rows manually while the service is running.

## Validation

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q -p no:cacheprovider
```

Tests create and drop a random disposable PostgreSQL database. They use an isolated temporary directory for state and uploads, never the application's local state. Set `CASHBOOK_TEST_ADMIN_DSN` to an appropriate local PostgreSQL admin connection when the default test server differs. No test resets the normal development database.

Real SMS/AWS/S3 deployment and native Android packaging remain future work. OTP recovery uses the local mock provider. No Android tooling is needed for this server or the browser frontend.
