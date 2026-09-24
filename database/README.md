# PostgreSQL

From this folder, `docker compose -p cashbook-local up -d` starts PostgreSQL 17 on `127.0.0.1:5433`, database/user `cashbook`. This local-only setup uses `cashbook_local` as the database password. If overriding `POSTGRES_PASSWORD` before first initialization, also update `backend/.env`'s DATABASE_URL.

The named volume is `cashbook_local_v2`; stopping the container preserves it. Backend startup applies `db_init.sql` once to an empty database and seeds Sohail Malik with `ADMIN_PASSWORD` from `backend/.env`. It refuses an unversioned older users schema rather than dropping or guessing at existing data. Repeated startup does not reset users or passwords.

The latest provided schema is retained with these necessary additions:

- Generated identity keys for integer IDs and PostgreSQL UUID defaults for accounts/sessions.
- `numeric(18,2)` amounts in entered currency units, rather than assuming the unconfirmed integer minor-unit convention. API limit is 999,999,999,999.99 per transaction.
- Version snapshots include head, category, active status, editor, action, display path and category name. Previous snapshots and attachment associations are immutable, so editing or merging preserves the requested trail.
- Transaction creation time is independent from version creation time.
- Deleted/merged heads become hidden tombstones. Exact permission rows survive and never transfer to another head. Live-name uniqueness excludes these retired heads.
- Upload metadata records original name, MIME, uploader and submitted status; composite extension/type FK prevents mismatched media classification.
- Head backups are ordinary deactivated heads and transactions, with copied version history and retained immutable attachment references. Backup and merge commit together when requested. Existing permissions remain unchanged.
- Categories have an active flag so removal preserves transaction history. Head names allow 160 characters for dated backup suffixes.
- A head revision detects stale staged tree edits. Startup applies the version 2 migration for category removal and longer head names without resetting data. Any legacy ZIP archive table is retained, but its old API and UI are removed.

Deleting a head deletes only transactions currently on that head, not its children's transactions. Child nodes are promoted. Merging repoints current transactions and records new versions, preserving historical head references. Shared and orphaned upload files are retained; they are not automatically removed with transactions.

For full recovery, preserve the PostgreSQL volume (or a PostgreSQL dump) and `backend/uploads` together. In-app head copies do not replace a database backup. Select a copied head and open Deactivated entries to inspect its copied transactions. The old `schema_overview/` diagrams are historical, not the current schema.
