# Cashbook Management System

One repository, one .git directory, and three project folders:

- database/: your schema, diagram, and database guide.
- backend/: your future backend code; currently only a guide.
- frontend/: your future frontend code; currently only a guide.

No application code, dependencies, or virtual environment have been created.

## Branches

`database_local`, `backend_local`, and `frontend_local` are ordinary Git branches in this repository. Only one is checked out at a time. Branches contain the whole project; they are not attached to individual folders.

Start on `database_local`. Follow database/README.md to correct the supplied SQL export and apply it to a NEW empty development database.

After finishing a database change:

```powershell
git add database
git commit -m "Prepare simplified cashbook schema"
git push -u origin database_local
git switch backend_local
git merge database_local
```

Then create your own virtual environment and backend code, following backend/README.md. Commit your work before switching branches. When ready to start the frontend:

```powershell
git switch frontend_local
git merge backend_local
```

Open this repository root in your editor. You do not need separate clones or worktrees. Local credentials and virtual environments must stay ignored by Git.

The SQL and SVG are supplied reference files, not a deployed database. This setup does not start services or change PostgreSQL. Stop old app terminals before starting new services on the same ports.
