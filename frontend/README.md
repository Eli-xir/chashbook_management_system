# Cashbook frontend

Run `npm run dev` from this folder. Checks: `npm run build`, `npm run lint`, and
`npm test` (Node 22.18+).

This is a frontend prototype. `src/data/cashbookApi.ts` is the shared async communication
boundary for login/logout, accounts, heads, permissions, attachments, user overview and
transaction submission. It currently returns simulated responses and saves prototype data
locally. Detailed backend integration documentation will follow once the ledger is settled.

## Current workflow

- Admin sidebar and ledger use a 1:2 split; mobile panels scroll horizontally.
- Create user reuses the account editor: name, multiple contacts and initial password.
  Editing, password changes, deactivation/reactivation and eligible deletion use the mock adapter.
- Sohail Malik remains under Your account, with full access. He never appears in user selectors
  and cannot receive or revoke individual head permissions.
- Select a user to open User preview or Give permissions. Permissions have separate undo/redo
  histories per user, with a review before Apply. Assigned heads glow; others appear dim.
- Preview follows balance → amount → Material/Labour → heads → images → voice notes → review
  → submit. Category does not filter heads. Voice notes can be uploaded or recorded.
  All steps retain input while going back to edit. Empty attachment steps may be skipped.
- The preview's outer heading identifies the account for the admin; the user screen exposes
  no profile/contact editing. Balance and credit history contain active admin credits only.
  Own submitted spends stay hidden and do not reduce that specified balance.
- New users start at zero until credits exist. Admin can credit a user from the ledger.
- Pending permission changes appear in preview; Apply is required before submitting against them.
  Mock submissions are stored locally. Password changes acknowledge success without storing
  credentials. Login matches active account names (`admin` also opens Sohail Malik); any
  non-empty password is accepted in this prototype. Account role selects `/Admin` or `/User`.
- Head rows, dialogs and attachment pickers are reused across editing, selection and review.
  Heads retain drag/drop, merge, undo/redo, name/image editing and review before Apply.
- The icon beside the pencil toggles transactionable/grouping-only status. The editor also
  stages deletion with a required transaction policy: hard-delete or backend backup file.
  Deletion removes only that head and promotes its children one level. Undo/redo and Apply
  review cover both controls. The mock adapter retains the policy in `headDeletionRequests`;
  actual transaction cleanup and backup files remain backend work. Retired IDs are not reused.
- Refresh reloads saved data. Discard confirmation protects unapplied edits and transaction drafts.
  Changing user, leaving preview or logging out also checks for a transaction draft. A full page
  reload discards unsaved input.

## Exact-head permissions

Assignments belong to exact user/head IDs, with no inheritance or traversal eligibility rule.
An assigned child without its parent appears as a reachable root in the user tree. Moving,
editing or merging heads never changes assignments. Merged-away IDs do not grant access to
the target and are not reused for new local heads. Inactive/missing heads are omitted.

## Local storage

`cashbook.admin.v1` stores profiles, heads, permissions and mock transactions. Earlier
`cashbook.heads.v1` data is imported when needed. Images/audio use data URLs for now;
head images and transaction attachments accept files up to 5 MB each.
Storage quota failures retain the submission draft. No credentials are saved or logged.
Currency denomination and backend amount conversion remain undecided; the prototype uses
the entered numeric amount as-is. The same card workflow serves `/User` and admin preview.
Swipe right for the user's received credits only, with no filters or self-submitted spends.

## Ledger and transaction cards

The admin ledger reads the complete dataset through `cashbookApi.ledger()`. Filters, ordering,
frontend pages, carry-forward amounts and report totals run locally. Credit/debit is derived
from creator versus account holder, as in the schema. Reports show active current entries only,
with no entry-ID column. Deactivated entries have a separate admin list for reactivation.

PDF, XLSX and print export all pages of the current report using the same report rows.
Report opening/closing balances follow the selected direction. The account summary shows
Total received by the user, Total Bill Payment (self-submitted bills), and Remaining Payable
Balance = bills minus received. Positive means owed to the user; negative remains with the user.
Admin summaries include entries through the end date, including carry-forward. Grouped reports
accumulate in display order. User ledgers/exports expose the same aggregate totals, but their
individual rows remain received credits only; self-submitted bill rows remain hidden.

The shared transaction card provides full-size image viewing and voice playback. Admin cards
support edits, deactivation/reactivation, deletion and an inline version trail. User cards are
read-only and omit status, account names, actions and history. Admin credit entry uses the
same form. Mutations live in `creditUser`, `editTransaction` and `transactionAction`; stale
version requests fail rather than overwrite a newer edit. The mock type catalog seeds General.

Backend mapping still needs a decision: the supplied schema versions amount/type/attachments,
but does not record the editing actor, previous head/category values or status changes.
The prototype stores those snapshots locally for the requested edit trail. Permanent IDs,
authentication, attachment storage, and the audit schema remain backend/database work.
