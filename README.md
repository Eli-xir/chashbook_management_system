# Cashbook: clean starting point

No backend/frontend application code, imports, dependencies, or virtual environment have been created. Your SQL and SVG are copied unchanged.

This repository has three separate working folders:

| Working folder | Checked-out branch | Edit here |
| --- | --- | --- |
| ../database | database_local | database/schema.sql |
| ../backend | backend_local | backend/ |
| ../frontend | frontend_local | frontend/ |

Each folder is a complete Git worktree. Open the folder for the part you want to work on; do not switch to a branch already checked out in another folder. Commits and branches are shared, but uncommitted edits are separate.

Start with database/README.md: correct the SQL export, then apply it to a NEW empty development database. Existing databases and the previous Desktop project are untouched by this fresh setup.

Commit database changes from the database working folder:

```powershell
git add database
git commit -m "Prepare simplified cashbook schema"
git push -u origin database_local
```

Then, from the backend working folder, bring in those committed changes:

```powershell
git merge database_local
```

Create your own virtual environment and first backend endpoint there, following backend/README.md. Later, from the frontend working folder, run `git merge backend_local` to bring in committed backend changes. Commit any work before merging.

Push backend/frontend changes from their respective folders with `git push -u origin backend_local` or `git push -u origin frontend_local`.

Stop old app terminals before starting new services on the same ports. This setup does not start services or modify PostgreSQL. Keep these worktree folders together; use `git worktree move` if relocating one later.
