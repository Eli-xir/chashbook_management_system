# Database: start here

`schema.sql` and `schema_overview/cash_book_schema.svg` are unchanged copies of your supplied files. The diagram is a reference; updating SQL does not update the SVG automatically.

The exported SQL needs these corrections before you execute it:

1. Change `DEFAULT 'gen_random_uuid()'` to `DEFAULT gen_random_uuid()`.
2. Remove double quotes around SQL TYPES: for example, use `VARCHAR(48)` instead of `"VARCHAR(48)"`, and `TIMESTAMPTZ` instead of `"TIMESTAMPTZ"`. Keep quotes around your mixed-case table names.
3. Reverse the `transactions_versions` foreign key. It must be on `Transactions.version_id`, referencing `Transaction_versions.version_id`. The export currently has it backward, which prevents adding later versions normally.
4. Add `ON DELETE RESTRICT` to that relationship and the `next_version_id` self-reference as agreed. The export currently uses the default deletion behavior instead.

Decide how you will generate integer IDs before writing inserts. The export's integer primary keys do not generate IDs automatically. You can use PostgreSQL identity columns for generated IDs and explicit IDs for fixed lookup tables. Never use `MAX(id) + 1` in concurrent application code.

Your amount check already permits zero and rejects negative values; `next_version_id` is already unique.

If administrators need to void transactions, add `Transactions.is_active` with a true default before implementing that feature. The supplied export does not contain it.

Apply the corrected schema to a NEW empty development database. Then write your own seed SQL for roles, payment media, transaction types, and initial users. Store passwords as password hashes and keep credentials outside Git.

## Rules for the eventual backend

- A transaction points permanently to its original version. Follow `next_version_id` to the terminal version for its current value.
- Creating a transaction and its first version must be atomic.
- Corrections append versions atomically, with concurrency control so two corrections cannot lose a link.
- Foreign keys and uniqueness do not prevent every cycle, shared transaction chain, or unowned version. Enforce these rules in the backend.
- Users see their assigned head tree and submit entries. A parent permission includes descendants.
- Users do not browse transaction history or reports. Admins manage users, heads, permissions, and transactions.
- Entries post immediately. Admins make corrections after offline discussion; there is no amendment request or approval queue.
- Heads can be rearranged without head audit logs. Prevent cycles; an inactive ancestor blocks new entries underneath it.
- There are no vendors or transaction descriptions in this design.

Before building dated reports, settle whether the first version's timestamp is the transaction date or whether backdating is needed. Keep this decision separate from correction timestamps.
