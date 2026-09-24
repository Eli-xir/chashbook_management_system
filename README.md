# Cashbook

Local React/Vite frontend, FastAPI backend and PostgreSQL. Production runs on Lightsail with private S3 media and GitHub Actions deployment; see [deployment](deploy/README.md).

## Run on this machine

PostgreSQL has been started using `database/compose.yaml`. To start it again:

```powershell
cd database
docker compose -p cashbook-local up -d
```

In a backend terminal:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

If PowerShell blocks activation, use `.\.venv\Scripts\python.exe -m uvicorn main:app --reload` instead.

In a frontend terminal:

```powershell
cd frontend
npm run dev
```

Open the Vite address, normally `http://localhost:5173`. Login as **Sohail Malik** (or `admin`). The generated initial password is the `ADMIN_PASSWORD` value in **backend/.env**. That file is ignored by Git. First backend startup creates the schema and admin if needed; later startups preserve data. Change passwords through Users after that; editing the environment value does not reset an existing account.

## Fresh machine setup

Install Python 3.13, Node.js compatible with the frontend's Vite version, and Docker Desktop with Linux containers. Then:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
# Set ADMIN_PASSWORD in .env before first startup.
cd ../frontend
npm ci
```

Start PostgreSQL and the two applications using the commands above. The API stays on localhost:8000; Vite proxies `/api`, including uploads and downloads. For a phone on the same Wi-Fi, use the computer's LAN address and Vite port. Mobile microphone recording needs a secure browser context (HTTPS); audio-file upload remains available on local HTTP. Production uses HTTPS.

## Behavior

- Sohail is the administrator. Users cannot modify profiles, contacts, passwords, heads or permissions. Admin manages all of those, including multiple contacts per user.
- Users see the balance/amount cards, then category, heads, optional images, optional voice, review and submit. Swipe right for their credits ledger. Their own bill entries never appear in their history or media downloads.
- Admin preview lets the admin explore the user's workflow without uploading attachments or submitting transactions. Only the signed-in user can submit their own bill. Credit a user uses the same cards and records an admin credit.
- Permissions are exact head IDs. No inheritance or traversal requirement. Moving or merging heads never transfers permission. Deleted/merged heads keep hidden database records so their old assignments do not change or get reused.
- Head edits, moves, merges, activation and deletion are staged with undo/redo and Apply. Merge transfers transactions to the target and adds an edit-trail version; child heads move under the target. Deactivation includes existing descendants; reactivation affects only the selected head.
- Head deletion promotes its children one level and permanently removes that head's transactions and versions. Create backup copies the entire branch to the top level, with a dated Backup suffix on every copied head. Copies include transactions, edit history and retained attachments; all copied heads and transactions are deactivated and excluded from totals. Merging offers a backup of the source branch before it is removed. Backups are staged with undo/redo and created on Apply.
- Admin can remove categories from future selections without deleting existing transactions. Adding the same category name again restores it.
- Account deletion is blocked by transaction/edit history; deactivate instead. Deactivation and password changes revoke the affected user's sessions (the admin's current session survives their own password change).
- Total received is active admin credits. Total Bill Payment is active user bills. Remaining Payable Balance = bills − received; positive means owed to the user. `1,635,250 − 1,415,750 = 219,500`.
- The schema uses exact decimal amounts in the units entered, with at most two decimal places. No hidden multiplication/division into paisa. This replaces the earlier unconfirmed integer/minor-unit assumption.
- Admin ledger filters, head branches, ordering, frontend pages, carry-forward, PDF, Excel and print remain client-side. No attachments column or entry-ID column is exported. User reports contain credits and their three summary figures only.

## Data and maintenance

PostgreSQL uses the separate `cashbook_local_v2` Docker volume on localhost port 5433. Original databases/volumes and browser prototype data are not imported or erased. Uploaded files live in `backend/uploads`; head backups are deactivated copies in the ordinary head tree. Back up **both** the database and uploads folder together. Removing an attachment from a draft does not erase its stored file; shared/versioned media are retained rather than deleted behind another record's back.

The backend has four Python modules: routes/auth/uploads (`main.py`), rules (`service.py`), request validation (`models.py`), and connection/bootstrap/password hashing (`db.py`). There is no ORM, worker queue, server pagination or cache layer. See [backend/README.md](backend/README.md) for the frontend communication contract and [database/README.md](database/README.md) for schema decisions.

The application test suite and browser checks were not run, as requested. Deployment performs production builds, syntax checks and basic HTTP/container health checks. Dependency installation, Docker startup and initial database setup are separate setup operations. Before deployment, exercise login, credits/bills, permissions, uploads, edits, backups and exports using actual accounts. The old mock-storage tests were removed; pure frontend tree/permission/profile tests remain available.
