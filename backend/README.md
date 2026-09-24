> Current behavior: version 3 removes categories from the API/UI, adds descriptions, and makes permissions inherit through branches. See [migration and API changes](../database/migrations/README.md); that note supersedes older category and exact-head examples below.

# Backend and frontend communication points

Run from this folder with `uvicorn main:app --reload` after activating `.venv`. Configuration is loaded from `.env` automatically. See the root README for setup and initial admin login.

All amounts are in PKR. User overview `balance` is received minus paid (negative when the user is owed money); `remainingPayable` is paid minus received for the admin's payable summary. These are opposite perspectives of the same account.

Transaction `headPath` is resolved from the current head tree on every read, so renames and moves appear in both ledgers, transaction cards and exports. Each edit-trail version retains its original saved path.

`frontend/src/data/cashbookApi.ts` is the only client API adapter. Components use its existing functions; no component builds transaction requests independently. Responses use the frontend's `AdminUser`, `Head`, `Transaction`, `TransactionRevision` and `UserOverview` shapes. All permanent IDs are database-generated; negative head IDs exist only in an unapplied tree draft.

| Route | Purpose |
| --- | --- |
| GET /api/session | Current `{userId, role}` or null |
| POST /api/session | `{username, password}` → session; sets HttpOnly, SameSite=Strict cookie |
| DELETE /api/session | Revoke current session and clear cookie |
| GET /api/state | Admin: full heads/users/permissions/transactions/catalogs, including deactivated backup copies. User: own minimal profile, own exact permissions, permitted active heads and catalogs; no transaction rows or contacts |
| GET /api/state?userId=UUID | User overview: credits only plus received/bill/payable totals. Admin can preview any user; regular users can request only themselves |
| POST /api/changes | One validated change command; applies atomically |
| POST /api/attachments | Multipart `file`, `kind` (`image` or `voice`); maximum 5 MB/file; returns attachment metadata |
| GET /api/attachments/ID | Authenticated media; admin, permitted head image, current received credit evidence, or own unused draft upload only |

All writes require `X-Cashbook: 1`, which the adapter supplies. There is no cross-origin API allowance: use the Vite `/api` proxy. Sessions expire after seven days and the backend checks active status on each request. Set `COOKIE_SECURE=true` when moving to HTTPS. Passwords use salted scrypt hashes; credentials are not returned to the frontend.

The change endpoint has these command shapes:

```text
{op:"user", action:"create", profile:{user_name, contacts}, password}
{op:"user", action:"profile", userId, profile:{user_name, contacts}}
{op:"user", action:"password", userId, password}
{op:"user", action:"deactivate"|"reactivate"|"delete", userId}
{op:"permissions", userId, ids:[headId,...]}
{op:"heads", revision, changes:[...staged changes...]}
{op:"category", name}
{op:"category", action:"delete", id}
{op:"transaction", action:"submit"|"credit", userId, input}
{op:"transaction", action:"edit", id, expectedVersion, input}
{op:"transaction", action:"deactivate"|"reactivate"|"delete", id, expectedVersion}
```

`input` is `{amount, headId, categoryId, transactionTypeId?:1, attachments:[{id,kind,name,url}]}`. Only attachment IDs are authoritative; the server ignores supplied display metadata. A normal user can only submit a bill for themselves, against an active, transactionable, explicitly assigned head, using their own unused uploads. Admin submissions of user bills are rejected with 403; preview cannot submit. Admin can credit a user through the separate credit action. Category choice never filters the head tree.

Head changes use the existing `StagedChange` union: create (temporary negative ID), edit, move, merge, delete, backup and active (true/false). A manual backup is `{op:"backup", head_id}`; merge accepts `backup:true` to copy its source branch first. Backups create new head, transaction and version IDs, retain immutable attachment references and original transaction dates/authors, and append a Backup created version. The root copy goes to the top level; every copied head has a dated Backup suffix. All copied heads and transactions are deactivated. Existing permissions are unchanged and new copies have no assignments. Deletion has no backup-file option and permanently removes only the selected head's transactions, promoting its children. The server resolves temporary IDs in sequence and applies the whole batch atomically. Head revision and transaction expected-version conflicts return 409 rather than overwriting another session. Permission changes replace exactly the specified user's assignments. They do not affect other users or descendants.

Category removal deactivates the category for future selections while retaining historical references. Creating a previously removed category name reactivates it. Removed categories cannot be used in new or edited transaction input.

Profile, permissions, heads, category and account actions return a fresh admin state. Create-user returns `{data, user}`. Credit/edit/status returns the updated transaction including its edit trail; delete returns null. Bill submission returns `{id, applied:true}` without exposing a bill history. Attachment upload returns `{id, kind, name, url}`.

Errors use HTTP 400/403/404/409/422 with `detail`; expired authentication uses 401. The adapter turns them into existing form errors and sends expired sessions back to login. No automatic retries of transaction writes are performed.

State is deliberately small-scale: full admin data per read and one short PostgreSQL transaction per mutation. A database write lock serializes mutations to keep permission checks, submissions and head operations consistent; state readers share a read lock so a deletion cannot interrupt their multi-query response. No server ledger/report variants: filtering, pagination and export continue using the same client report model.

## Production storage

Docker sets DATABASE_URL and COOKIE_SECURE=true. When CASHBOOK_S3_BUCKET is configured, storage.py saves private S3 media and returns short-lived signed downloads after authorization. Otherwise local uploads continue to work. See ../deploy/README.md for production configuration and backups.
