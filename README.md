# Cashbook Management System

A cashbook application being developed to organize transactions by hierarchical heads and vendors, with user access controls and transaction amendment review.

## Current status

Initial repository scaffold. The frontend and backend are not implemented yet, and `database/schema.sql` is currently an empty placeholder. No application start commands or automated tests are available yet.

## Repository layout

```text
cashbook_management_system/
|-- backend/             # API, authentication, authorization, and business logic
|-- database/
|   `-- schema.sql       # PostgreSQL schema (to be implemented)
|-- frontend/            # User interface
`-- README.md
```

This is one Git repository. Run Git commands from the repository root; do not initialize separate repositories inside the three folders.

## Planned functionality

- Users, roles, and head/vendor access assignments.
- Nested heads and subheads with vendor assignments.
- Cashbook transactions tied to valid head/vendor pairs.
- Payment media and debit/credit transaction types.
- Activation and deactivation with the latest status-change details.
- Transaction amendment requests and review decisions.

These describe the intended scope, not completed features. Planned database: PostgreSQL 17. The application is intended to accept whole-PKR amounts.

## Development setup

1. Install Git and PostgreSQL 17 when beginning database development.
2. Clone this repository and open its root directory in your editor.
3. Choose and document the frontend/backend frameworks as they are introduced.
4. Implement and review `database/schema.sql` before applying it to a development database.

After the schema has been implemented, it can be applied to an existing local development database with:

```sh
psql -U postgres -d cashbook_management_system -v ON_ERROR_STOP=1 -f database/schema.sql
```

The database must already exist. Do not treat this command as a repeatable migration or run unreviewed schema changes against production. Once there is persistent data, add versioned migrations under `database/migrations/` rather than relying on changes to the schema file alone.

## Everyday Git workflow

Run these commands from the repository root. Start with a clean working tree:

```sh
git switch main
git pull --ff-only
git switch -c feature/transaction-entry
```

Edit any combination of `frontend/`, `backend/`, and `database/` needed for the feature. Then review and commit:

```sh
git status
git diff
git add frontend/ backend/ database/
git diff --cached
git commit -m "Add transaction entry flow"
git push -u origin feature/transaction-entry
```

Stage README or other root files explicitly when changed. Prefer specific file paths when a folder contains unrelated work. For subsequent commits on the same branch, use `git push`.

Open a pull request on GitHub. After merging it:

```sh
git switch main
git pull --ff-only
git branch -d feature/transaction-entry
```

Use one branch per coherent change, even when it spans all three folders. Folder-specific review commands:

```sh
git diff -- frontend/
git diff -- backend/
git diff -- database/
```

## Configuration and sensitive data

Never commit database passwords, tokens, real customer records, or local database dumps. Local environment files are ignored; commit only sanitized `.env.example` templates. Store password hashes, not plaintext passwords, when authentication is implemented.
