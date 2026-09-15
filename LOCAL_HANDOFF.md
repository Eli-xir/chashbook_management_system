# Local handoff — 16 September 2026

Open **http://127.0.0.1:5173**.

| Username | Local demo password | Account |
| --- | --- | --- |
| admin | admin123 | Administrator |
| debit1 | debit123 | Debit user |
| credit1 | credit123 | Credit user |

These existing development credentials were verified; no passwords were reset.

## Where it runs

- Frontend: `C:\Users\Ali Irfan\Documents\Codex\2026-09-10\te\cashbook_workspace\frontend`, branch `frontend_local`, IPv4 port **5173**.
- Updated backend: `C:\Users\Ali Irfan\Documents\Codex\2026-09-10\te\cashbook_backend_run\backend`, branch `backend_local`, port **8001**.
- Existing PostgreSQL configuration is read from the backend `.env`. The database schema and existing development data were not reset.

Older processes on backend port 8000 and IPv6 localhost:5173 belong to a different Windows security context and could not be stopped from this session. Close their original terminals when convenient. Use only the new URL above; do not submit writes to the old backend while testing the updated application (ID allocation is single-process).

## Restart after closing the current services

Backend terminal:

```powershell
cd 'C:\Users\Ali Irfan\Documents\Codex\2026-09-10\te\cashbook_backend_run\backend'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Frontend terminal:

```powershell
cd 'C:\Users\Ali Irfan\Documents\Codex\2026-09-10\te\cashbook_workspace\frontend'
npm run dev
```

Current background service logs are `service.log` and `service-error.log` in each directory. No Android dependencies were installed.

## Changes and checks

Backend fixes: typed report dates; payment-method ID allocation; mutation CSRF checks; serialized head moves and account/recovery changes; OTP state restoration; normalized phone numbers; numeric amount bounds; attachment reference-safe cleanup/private cache headers/content signatures; payload-aware submission retry journal; head photos protected by head visibility.

Frontend rebuilt around the guided panel flow and a responsive admin workspace. Production build passed. The original API suite was run in a newly created disposable database; issues uncovered during the changes were fixed and their focused checks passed. Tests now isolate local state/upload files and create/drop a random test database instead of resetting a shared named database. Further OTP testing was stopped at the owner's request. Visual checks covered desktop sign-in and the mobile head/subhead panel.

This is a local, single-backend-instance application. Do not run multiple writing backend workers or modify ID-bearing rows manually without restarting. Keep local state files with the database when backing up: `.media_state.json`, `.idempotency_state.json`, `.otp_state.json`, `.otp_secret`, and `local_uploads/`. These files are not committed. Real SMS, S3, AWS deployment, native Android permissions and APK compilation are still separate deployment work.
