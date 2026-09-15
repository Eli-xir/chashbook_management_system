# Database

`db_init.sql` initializes a fresh, empty PostgreSQL database atomically. It does not drop existing tables or migrate an older schema. The SVG is an older reference diagram.

```powershell
psql -h localhost -U postgres -d YOUR_NEW_DATABASE -v ON_ERROR_STOP=1 -f database/db_init.sql
```

## Creating a transaction

Each version belongs to a transaction through `Transaction_versions.transaction_id`. `Transactions.current_version_id` selects its effective version. A composite foreign key ensures the selected version belongs to that same transaction.

Use explicit BEGIN/COMMIT: insert the transaction first, then its initial version, then commit. The current-version foreign key is INITIALLY DEFERRED, so the pointer is checked at commit without needing SET CONSTRAINTS. A missing version or a version belonging to another transaction cannot commit. The version's ownership foreign key is initially immediate, so this insertion order matters. Autocommit between the two inserts will fail.

## Correcting a transaction

In one database transaction, lock the Transactions row using SELECT ... FOR UPDATE, insert the new version, and update current_version_id. Keep previous versions for history. Read current values with a direct join; there is no linked version chain.

Current versions are protected from deletion. Backend authorization must still prevent historical-version edits/deletion and enforce admin-only corrections. Serialize competing corrections using the row lock.

## Unchanged choices

- Integer IDs must be supplied explicitly; automatic generation has not been added.
- Zero amounts are allowed; negative amounts are rejected.
- Head names are globally unique. The backend must prevent multi-head cycles.
- Parent permissions include descendants; inactive ancestors block new entries.
- Users submit entries using assigned heads. Admins manage transactions and corrections; no amendment queue or vendors.
- Transaction voiding and backdated dates have not been added.

The schema and guides are the only changes. No project environment or application code is included.
