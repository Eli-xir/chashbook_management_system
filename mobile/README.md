# Cashbook mobile apps

Thin Capacitor shells around the existing React frontend. The frontend is
**not** rebuilt or duplicated: the WebView loads the production Vercel site
(`server.url` in `capacitor.config.ts`), so cookies, the `/api` proxy and all
business logic stay exactly as deployed. No mobile code touches `frontend/`
or `backend/`.

## Why a hosted wrapper instead of bundled assets

- Bundled assets would change the app's origin (`https://localhost`), so the
  backend's `SameSite=Strict`, `Secure`, `HttpOnly` cookies would no longer be
  sent for `/api` requests, and relative `VITE_API_BASE_URL=/api` calls would
  miss. Supporting that would mean relaxing cookie rules — rejected for now.
- The wrapper keeps the app first-party to the Vercel origin: login, session
  persistence, attachments (auth-gated signed redirects) all work unchanged.
- Tradeoff: first launch needs network; there is no offline shell (by design —
  no authenticated API responses or attachments are cached).

## WebView adapters (Android: `MainActivity` + `CashbookWebViewClient` + `CashbookNative`)

Android's WebView lacks Web Share and blob: download support, so a small
injected polyfill routes them through native code:

- Anchor downloads of `blob:` URLs (PDF/Excel/CSV exports) → saved to Downloads.
- `window.open` on a `blob:` URL (ledger print preview) → fullscreen external
  viewer (PDF viewer app).
- `navigator.share` polyfill → native share sheet (WhatsApp, email, …).
- File inputs (camera/gallery/audio) are handled by Capacitor's built-in
  chooser; mic recording uses the `RECORD_AUDIO` runtime permission.

## Building

APK and iOS builds run on GitHub Actions (`.github/workflows/mobile-android.yml`,
`mobile-ios.yml`) — manual dispatch or pushes to `mobile-apps`. No local
Android SDK or Mac needed. The repo is public, so macOS runners are free.

## iOS signing reality check

An unsigned IPA cannot be installed on an iPhone. Options:

1. **TestFlight (proper path):** paid Apple Developer Program membership
   ($99/year). Requires: a distribution certificate, an App Store Connect app
   record with the bundle id `com.sohailmalikarchitects.cashbook`, and a
   provisioning profile. Testers install via the TestFlight app — no 7-day
   limit. We have **not** purchased anything.
2. **Free Apple ID sideload:** sign the unsigned IPA from the iOS workflow
   with AltStore or Sideloadly on Windows. Works without a Mac, but the app
   expires every 7 days and must be re-signed (max 3 sideloaded apps).
3. **PWA (implemented):** iPhone users can Add to Home Screen from Safari —
   see `frontend/public/manifest.webmanifest`. This is a website shortcut,
   not a native app.

Until an Apple Developer account exists, option 3 is the primary iPhone
solution, with option 2 available for a true app-icon experience.
