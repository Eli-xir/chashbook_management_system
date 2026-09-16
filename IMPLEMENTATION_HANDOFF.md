# Cashbook implementation handoff

## Instructions to the implementing agent

Implement a complete, usable LOCAL application in this repository. This document is the consolidated specification for a small office cashbook. Read `database/db_init.sql` before coding. Earlier README descriptions and the SVG may be stale; this specification and the current SQL supersede old vendor/amendment-chain designs.

Do the implementation, not just a plan or mockup. Work incrementally, run relevant checks, and finish with exact startup instructions and a feature/test report. Do not deploy to AWS, send real SMS, spend money, reset existing databases, or overwrite user changes. Configure local development without requiring AWS credentials. Never claim something was tested when it was only inspected.

Use one repository and its existing database/, backend/, frontend/ folders. There are ordinary `database_local`, `backend_local`, and `frontend_local` branches, not worktrees or nested repositories. Inspect the current branch and working tree; preserve existing work. Do not switch branches with uncommitted changes or push unless instructed. Keep a cohesive implementation together during development; explain branch integration rather than splitting uncommitted work.

## Stack and delivery

- Backend: Python, FastAPI, PostgreSQL, parameterized SQL and explicit transactions. Use a small maintainable structure, not an elaborate framework.
- Frontend: React, TypeScript, Vite; responsive admin website and a mobile-first regular-user experience.
- Android: Capacitor wraps the React application. No Flutter, Dart, or React Native rewrite. Add Android configuration and build instructions. Use supported plugins/APIs for camera, gallery, recording, and Android Back handling.
- Produce a working browser version first. If Android SDK/JDK tooling is unavailable, finish the web app and Capacitor preparation and state precisely what is missing for an APK. Do not pretend an APK was built or tested.
- Local private uploads and a local-only SMS substitute are required. Keep storage and SMS behind small interfaces for later S3/AWS SMS integration; AWS deployment is out of scope now.
- Supply pinned/reproducible dependency manifests, ignored local environment files, safe `.env.example` files, and startup instructions. You may create the development environment for this implementation; the earlier restriction against creating one applied to the scaffolding task.
- Use a NEW development database and separate test database. Never run the initialization script over an existing populated database. Provide explicit migrations for schema changes if supporting an existing installation.

## Confirmed business rules

Single-office application; PKR whole-unit amounts. Amount zero is allowed by the database; negative amounts are forbidden. No currency conversion, carry-forward balance, opening-balance entry, vendors, or transaction descriptions.

Exactly three application roles:

| Role | Allowed submission types |
| --- | --- |
| debit_user | debit, payable_debit |
| credit_user | credit, payable_credit |
| admin | Manages accounts, permissions, heads, transactions, and corrections |

Seed exactly four transaction types: `credit`, `debit`, `payable_credit`, `payable_debit`. Do not rely on frontend-supplied direction or unexplained numeric IDs. The backend derives a regular user's direction from their role and the boolean payable choice.

Payable is a stored distinction for future use. Normal cashbook calculations group credit + payable_credit together, and debit + payable_debit together. Balance = credit minus debit. Do not implement settlement, debt aging, outstanding balances, or approval statuses.

Regular users have an entry-only workflow. They cannot list/read transactions, including their own history, see totals/reports, manage people/heads/permissions, amend, deactivate, or delete transactions. Creation can return a minimal success receipt. Do not expose a transaction detail route to them after submission.

The admin sets up accounts, usernames, initial/reset passwords, roles, contacts/recovery numbers, active status, and head permissions. No public signup or regular-user account-management screen. Admins can manually reset passwords.

New entries are effective immediately. There are NO Pending/Approved/Rejected/Review/Amended states, request queues, or requester-apply workflow. Users discuss errors physically; admins make corrections directly as new versions.

## Explicit provisional defaults

These fill gaps; they are not previously confirmed business requirements. Document them in the implementation report and keep them easy to change. Ask only if they block implementation:

- Admins may create entries in either direction and select payable; regular users cannot select direction. Admin management access covers everything through a clear backend authorization rule, not a fragile UI assumption.
- Admins may change a user's debit/credit role. It affects future submissions only; historical transactions are not reclassified. Invalidate existing sessions on role/password/active-status changes and validate the current role on each request.
- Admin corrections may choose any of the four types, but preserve the transaction's original user and head. Head changes are not versioned by this schema, so do not silently overwrite them. A correction does not transfer authorship to the admin.
- Transaction reporting date is the first version's created_at timestamp, not the latest correction timestamp; no backdating input. Display/filter dates in Asia/Karachi and store timezone-aware timestamps. Use a stable ID tiebreaker for ordering.
- One designated recovery phone per user, unique across accounts for this implementation; other contacts may remain ordinary contacts. Only admins change it. No user-editable profile/contact screen.

## Heads and access

- Parent permission includes all descendants. Direct grants exist in User_head_permissions; do not redundantly insert every descendant grant.
- A user's tree exposes permitted branches. Ancestors necessary to reach a directly granted subhead may appear as navigation-only context, without exposing unrelated siblings or allowing submission to ungranted ancestors.
- A head may have both children and transactions. Any depth, including a root, may be transactionable; no leaf-only rule.
- `Heads.is_transactionable` controls whether Make transaction appears. It is already in current SQL, default false. Backend creation requires effective access, this flag, and an active head with no inactive ancestors.
- The tree displays permitted children at each level. Server-side checks must be repeated at submission, since permissions or heads might change mid-form.
- Admins may add/edit/move/activate/deactivate heads. Prevent self-parenting and all longer cycles, including concurrent moves. No head audit logging is requested.
- Moving a subtree naturally changes inherited permissions. Do not reject moves because historical creators lack the new path. Existing transactions remain linked to their head ID; reports show its current location.
- Inactive parent blocks new activity throughout its subtree without deleting permissions/history. Derive effective activity from ancestors; do not erase a child's independent inactive flag on parent reactivation.
- Head names are currently globally unique; do not silently change that requirement.

## Regular-user mobile UI

Use simple language, large touch targets, readable contrast, and a single main action per step. Present heads as tappable cards in a scrollable panel, navigating one level at a time. Avoid stacks of overlapping modal popups.

1. Username/password sign-in, plus Forgot password.
2. Assigned top-level heads. Tapping a head opens its permitted children.
3. On a permitted transactionable head, Make transaction is the FIRST item above its child cards. Show breadcrumb/context.
4. Amount + payment medium. Use a numeric keyboard and clear PKR label.
5. Optional image: Add image offers Camera and Gallery; show preview, replace/remove, and Next to skip.
6. Optional voice note: record, stop, play, re-record/remove; Next to skip. Handle microphone denial and unsupported devices clearly.
7. An Is this payable? toggle, default off, immediately before Review. No credit/debit selector for regular users.
8. Review is scrollable: full head path from root to selected head, amount, medium, exact type/payable choice, then image followed by voice attachment. The earlier button says Review, not Send.
9. One final Send button. Show progress, prevent repeated taps, and use backend idempotency to prevent duplicate entries after network retries. Preserve the draft on failure. On confirmed success show a simple confirmation, clear the draft, and return to top-level heads.

Back is visible at every nested tree level and every form/review step. It returns one step and preserves data, attachments, and payable choice. Hardware/browser Back follows the same behavior. At the root do not invent a parent. Confirm before abandoning a dirty draft, not every ordinary step. Revoke preview object URLs and microphone streams when no longer needed.

Online-only initial implementation. Do not queue financial submissions invisibly for later. Retain the current draft for retry during ordinary navigation/network failure; document any limitations across closing/restarting the app.

## Admin interface

Desktop sidebar, responsive mobile navigation: Cashbook, Heads, Users, Settings. Preserve filters/scroll when returning from details.

Cashbook: filtered credit/debit/balance summaries; date range, head including descendants, user, direction, and active/inactive filters; paginated table on desktop and readable cards on mobile. Default totals exclude inactive entries. When inactive entries are displayed, distinguish them and do not silently include them in active totals. No carry-forward row. Paginated results must not limit the aggregate totals to the visible page.

Transaction detail: user, date, full head path, effective amount/type/medium, image and playable voice note. Show current details and dated version history with before/after differences. Side panel on desktop/full screen on mobile. Actions: Correct, Deactivate/Reactivate, Delete. Keep destructive actions separate. Correct -> edit permitted fields -> review -> save version. Permanent deletion requires explicit confirmation.

Heads: tree navigation, create root/child, name/description/image, transactionable toggle, active toggle, Move to destination picker. Explain subtree effects. No drag-and-drop-only controls.

Users: create/edit account, role, contacts and designated recovery number, set/reset password, active status, assigned-head tree, and Preview user view. Distinguish direct vs inherited permissions; selecting a parent includes descendants. Never reveal stored password hashes. Do not disable/delete the last active admin through routine management.

Settings: admin account and payment-medium management. Do not hard-delete referenced lookup rows. Transaction types/roles are fixed system values, not unrestricted editable labels with business semantics.

## Password recovery

Normal login is username + password. Mobile recovery is exactly:

Forgot password -> username -> SMS OTP to the ADMIN-REGISTERED recovery number -> verify OTP -> new password + confirmation -> automatically signed in -> assigned heads.

An OTP is only a one-time recovery mechanism, not a reusable alternate login mode. Successful verification creates a short-lived, single-use reset grant, not a full authenticated session. Password submission atomically consumes the grant, changes the password, invalidates old sessions/challenges, and creates the new session. No repetitive mandatory reset screen on ordinary logins. Inactive users cannot recover into an active session.

Use cryptographic random codes, short expiry, bounded attempts, resend cooldown, account/IP throttling, generic responses to avoid username enumeration, and server-side verification. Do not return live OTPs to the frontend. Store a keyed digest of the code, not plaintext or an easily brute-forced unsalted hash. Bind challenges to the user, recovery number and purpose; invalidate on password/phone changes. Reset grants must also expire and resist replay. Admin manual resets remain available.

For LOCAL development only, use an explicitly configured mock SMS provider that prints the code in the local backend console, with a development banner. It must be impossible to select this provider in production configuration. Never send paid SMS during local tests. Website recovery may reuse the same simple workflow.

## Database and consistency

Preserve the latest db_init.sql design: Transactions owns head/user/current_version_id/is_active; Transaction_versions owns transaction_id/amount/medium/optional attachments/type/timestamp. The composite foreign key ensures a current version belongs to the same transaction and is INITIALLY DEFERRED. There is no next_version_id chain.

Create transaction first and initial version second in one SQL transaction. Reserve/generate IDs safely; integer primary keys are currently not generated automatically. Add explicit identity/sequence support for generated IDs, with a documented migration; never use MAX(id)+1. Keep lookup IDs deterministic and do not cause sequence collisions with seeds.

Correct under a row lock, insert a new version and update the pointer atomically. Lock/check current data when applying competing edits. Deactivate/reactivate changes only Transactions.is_active. Deleting a transaction cascades to all versions, but does not delete shared file metadata, users, heads, or media. Independent version edits/deletion must not be exposed as application operations.

Minimum schema additions needed: recovery-phone designation, OTP challenge/reset-grant persistence, secure session support, idempotency/upload ownership where needed, generated IDs, and seed data for the three roles/four types. Make small explicit additions; do not encode the entire application in triggers. Update init SQL and provide migrations if needed. Keep schema documentation accurate.

Use secure password hashing and opaque high-entropy sessions with expiration/revocation. Web: HttpOnly cookies with appropriate SameSite/Secure settings and CSRF protection for mutations. Capacitor: deliberately handle its origin and cookie/token behavior; use secure native credential storage if using bearer credentials, not localStorage. Never rely on frontend role checks. Configure allowed origins precisely; no wildcard credentialed CORS.

## Images and voice privacy

Local files live outside public/static frontend assets. Store stable object identifiers, never client-selected filesystem paths. Validate file content/type/size and safe names; avoid path traversal. Uploads must belong to the authenticated draft/user, so one user cannot attach/read another user's file by guessing IDs. Permit draft previews without granting regular users historical transaction access.

After submission, admins can retrieve transaction attachments through authorization-checked endpoints. Do not make URLs publicly readable. A later S3 implementation uses private objects and short-lived signed access only after backend authorization; never persist expiring signed URLs as permanent storage locations. Browser/Capacitor audio playback must work with the selected authentication mechanism.

Use bounded upload/recording limits with visible messages. Failed or abandoned uploads need safe cleanup; deleting a transaction must not automatically delete shared attachments still referenced elsewhere. Do not put AWS credentials or database credentials in client code.

## Acceptance checks and completion

Use a disposable fresh test database, not user data. Include focused integration tests and manual UI checks:

1. All three roles sign in; active status/session expiry/revocation enforced.
2. Each regular role can submit its two types and cannot forge the other direction or call admin/read endpoints.
3. Permissions inherit correctly; ancestor context does not grant extra access; inactive ancestors and nontransactionable heads reject submission.
4. Parent with children can also accept entries; moving a subtree preserves transaction identity and changes effective inherited access correctly; cycles rejected.
5. Mobile Back preserves the full draft; camera/gallery/voice error states, skip, playback, payable toggle, review, and retry work.
6. Duplicate submission/retry creates exactly one entry, including concurrent requests and changed payload under the same idempotency key.
7. First version and correction are atomic; incorrect/missing current version rejected; history retained; concurrent corrections cannot silently overwrite a stale edit.
8. Deactivation excludes totals; reactivation restores; deletion removes owned versions only; payable variants group correctly; totals cover the full filtered result.
9. Recovery expiry, attempts, resend, inactive account, replay, phone change, and reset-grant single use enforced; successful reset goes directly to heads.
10. Attachments cannot be accessed/attached by another regular user; sensitive routes are protected even without UI navigation.
11. Desktop/mobile layouts, keyboard navigation, loading/empty/error states, and selected timezone/date boundaries work.

Final deliverables: runnable code, seed command with local demo accounts for all roles, credentials delivered privately in the local completion output (not production secrets committed to Git), env examples, startup/shutdown commands and ports, migrations/init SQL, focused tests and results, and Capacitor build/install instructions or signed/debug APK with its actual testing status. Do not ship dead buttons, placeholder backend calls, or silently omit features. List genuine blockers and provisional decisions clearly.

For later deployment inputs, read AWS_DEPLOYMENT_INPUTS.md. Finish local implementation first.
