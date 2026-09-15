# Cashbook browser interface

Rebuilt mobile entry flow and responsive administrator workspace. No Android SDK is required to run the website.

## Run locally

```powershell
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to the backend at `http://127.0.0.1:8001` (configured in `vite.config.ts`). Use the IP address rather than localhost while the older IPv6 development server is still running on this machine.

`npm run build` checks TypeScript and builds the website. The development server stays on port 5173 and fails clearly if that address is occupied.

## Included

- Username/password sign-in and password-recovery screens.
- One changing, scrollable mobile panel: heads, amount/payment method, optional photo (camera/gallery), optional voice, payable choice, review, send.
- Back navigation through heads and steps; drafts scoped to the signed-in account; stable retry keys after an uncertain submission.
- Administrator cashbook with date/head-and-descendants/person/direction/inactive filters and full-result totals.
- Entry detail, original date, correction review, attachment replacement/removal, version history, deactivation/reactivation and confirmed permanent deletion.
- Head creation/editing/moving, transactionable flag, activity, optional photo.
- User creation, roles, passwords, contacts/recovery number, direct/inherited head permissions and tree preview.
- Payment method maintenance and administrator password change.

## Current local setup

The frontend runs from `cashbook_workspace/frontend` on `frontend_local`.
The backend runs from the existing `cashbook_backend_run/backend` checkout on `backend_local`.
These are the two checkouts created by the preceding implementation; no additional checkouts were created during the redesign.
See `LOCAL_HANDOFF.md` at the repository root for exact paths and startup commands.

## Android and deployment

No Android SDK, JDK, emulator, or APK was installed/built. Capacitor configuration remains available for a later native build. Browser camera/microphone features need a secure origin (localhost is allowed by browsers); phone access over ordinary LAN HTTP cannot reliably record audio. A later APK needs Android tooling and a separate device/cookie/media integration check.

SMS recovery currently uses the local mock provider, not real SMS. AWS deployment and real SMS/S3 providers are not configured.
