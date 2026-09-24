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

This change has not been deployed or applied to production. Deploy backend and frontend together; an old frontend still sends category fields and is incompatible with the new request model. Take the existing database backup before rollout. The changed schema baseline intentionally triggers the current release script's manual schema review guard. Apply this migration in a transaction (or allow the new backend initialization to apply it), then update the reviewed server schema baseline as part of the coordinated rollout.

Do not roll back to an old application image after new category-free transactions have been created: the old backend expects category IDs. Keep the version 3 database and fix forward, or restore the pre-rollout backup together with the previous application version.
