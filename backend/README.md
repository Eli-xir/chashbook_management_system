# Backend: your implementation

This folder intentionally contains no application code or imports.

After the new schema works in an empty development database:

1. Open the backend working folder and merge your committed `database_local` changes.
2. Create and activate your own Python virtual environment at the project root.
3. Choose and install your dependencies. FastAPI and a PostgreSQL driver match the previous stack; you control the new setup.
4. Write a minimal application with a health endpoint, then database configuration. Put local secrets in an ignored `.env` file.
5. Implement sign-in, sessions, active-user checks, and authorization. Make the first protected endpoint return the signed-in user's assigned head tree.
6. Implement transaction creation with its first version in one database transaction.
7. Add admin user/head/permission management, transaction listing, and version corrections.
8. Add private image and voice uploads and protected retrieval. Do not expose an upload directory or treat stored paths as authorization.
9. Verify unauthorized users cannot read transaction data or attachments and cannot call admin endpoints, even directly.

You can add modules as each responsibility appears. There is no need to create many empty Python files first. Record your chosen dependencies and a reproducible startup command once your first endpoint runs.

Use the agreed workflow in `database/README.md`; the previous application's amendment and vendor workflows do not apply.
