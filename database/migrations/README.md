# Version 3: descriptions and branch permissions

`003_descriptions_permissions.sql` upgrades an existing version 2 database without resetting it. Backend startup applies it once, within the initialization transaction and advisory lock. Fresh databases use the updated `db_init.sql`. Start the backend normally with `uvicorn main:app --reload`; restart an existing backend process to load these changes.

- User descriptions live in `users.description`.
- Transaction descriptions live in `transaction_versions.description`, so every edit, backup, and activation change keeps its description history. New descriptions are initially empty; historical category names are not presented as transaction descriptions.
- Head descriptions reuse `heads.head_description`.
- `user_head_permissions.allowed` distinguishes an explicit grant from a denial. Existing grants remain grants and now cover descendants. The nearest ancestor rule determines access; no rule means no access. The frontend clears descendant overrides when granting or revoking a whole branch. New descendants inherit automatically. Moving a branch retains its explicit rules and changes inherited access according to its new ancestry.
- Categories are retired from the API and UI. Old category tables/columns remain only to preserve historical data; their foreign keys are nullable for new transactions. No new category is selected or required.

## Communication points

No endpoints were added. `POST /api/changes` accepts `description` on transaction inputs and user profiles, and `head_description` on head create/edit inputs (maximum 4,000 characters). The category operation and `categoryId` input were removed.

The existing permissions `ids` array encodes an explicit grant as a positive head ID and an explicit denial as its negative. Database head IDs remain positive; storage uses the separate `allowed` column. Admin state returns these rules. Ordinary-user state returns only accessible active heads and their effective positive IDs, with inaccessible parents omitted. This prevents ancestor navigation from being required. Both transaction submission and head-image downloads enforce the same inherited permissions on the backend.

Company statements reverse the user-facing credit/debit direction without creating or rewriting transactions. Search, filtering, sorting, pagination and exports remain frontend operations over the complete permitted dataset.

## Production rollout

GitHub deployment builds images first, stops backend writes, and uploads a complete PostgreSQL dump to the configured S3 backup prefix. A failed backup aborts deployment and restarts the previous backend. Only after backup success does a one-off new backend apply pending numbered migrations, in order, inside a transaction. A failed migration rolls back and restores the previous application. The new app starts after migration commits.

Add subsequent migrations as `005_name.sql`, etc., ending with an insert of their version into `schema_version`. Update the fresh schema too. Applied migrations are not rerun; never edit a migration already deployed. Infrastructure changes remain guarded separately. If an application rollout fails after migration commits, keep the new schema and fix forward, or deliberately restore the backup with the matching old app; no automatic database reset or incompatible app rollback is performed.

Version 4 scopes head-name uniqueness to siblings, including roots. This rollout includes versions 3 and 4.
