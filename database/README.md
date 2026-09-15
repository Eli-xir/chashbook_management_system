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

Current versions cannot be deleted independently while referenced. Backend authorization must still prevent independent historical-version edits/deletion and enforce admin-only corrections. Serialize competing corrections using the row lock.

## Deactivation and deletion

Transactions start active. Admin-only backend actions may deactivate, reactivate, or permanently delete a transaction:

```sql
UPDATE Transactions SET is_active = false WHERE transaction_id = 1;
UPDATE Transactions SET is_active = true WHERE transaction_id = 1;
DELETE FROM Transactions WHERE transaction_id = 1;
```

Deactivation preserves every version. Reports and totals must explicitly filter `Transactions.is_active = true`; the flag does not filter queries automatically. Admin history views can include inactive transactions.

Deleting a transaction cascades to all its versions, including its current version. It does not delete its user, head, payment medium, image/voice metadata, or stored files. Attachment cleanup is a separate backend responsibility and must account for shared references. Permanent deletion removes history; use deactivation when you need to retain it.

These constraints define data behavior, not application roles. The backend must restrict these actions to admins. This initialization file remains for fresh databases, not an existing-database migration.

## Unchanged choices

- Integer IDs must be supplied explicitly; automatic generation has not been added.
- Zero amounts are allowed; negative amounts are rejected.
- Head names are globally unique. The backend must prevent multi-head cycles.
- Parent permissions include descendants; inactive ancestors block new entries.
- Users submit entries using assigned heads. Admins manage transactions and corrections; no amendment queue or vendors.
- Backdated transaction dates have not been added.

The schema and guides are the only changes. No project environment or application code is included.
