# Mobile apps (Android APK + iOS)

The mobile app is a **native shell around the live deployment**. The webview
loads `https://13.202.242.159` directly, so the page origin IS the API origin:
cookie sessions, the CSRF double-submit token, and camera/mic permission
policies behave exactly as in a desktop browser. Nothing on the server had to
change, and frontend fixes deployed to the site are picked up by the installed
app without rebuilding or reinstalling it.

The app shows the live site, so it needs connectivity. If the server is down
the app shows a connection error — retry by relaunching.

## Current state (honest)

- **Signed release APK built on this machine** (2026-09-16) with JDK 17
  (Temurin) and the Android SDK command-line tools. `assembleRelease`
  completed with signing applied.
- **Not tested on a physical Android device** — no device/emulator was
  available. Install, login, camera, and voice recording must be smoke-tested
  on a real phone before handing it to the office.
- iOS project files exist under `frontend/ios/` but **no IPA was built** —
  Windows cannot run Xcode. See "iOS" below.

## What was built

- `frontend/capacitor.config.ts` — `server.url` points at the deployment
  (override with `CAP_SERVER_URL` at sync time), `androidScheme: https`.
- `frontend/android/` — Capacitor Android project:
  - `AndroidManifest.xml`: INTERNET + CAMERA + RECORD_AUDIO +
    MODIFY_AUDIO_SETTINGS (transaction attachments use the camera input and
    voice notes use MediaRecorder inside the webview).
  - `MainActivity.java`: requests CAMERA and RECORD_AUDIO runtime permissions
    once on first launch; Android denies web capture unless the app holds them.
  - `app/build.gradle`: release signing reads `android/keystore.properties`
    (gitignored). Without it, release builds are unsigned.
- `frontend/ios/` — Capacitor iOS project (Swift Package Manager based).

## Android tooling on this machine

Installed without admin rights under `C:\Users\Ali Irfan\AppData\Local\cashbook-build\`:

- `jdk-17.0.20.1+1\` — Temurin JDK 17
- `android\` — Android SDK (cmdline-tools, platforms;android-36,
  build-tools;36.0.0, platform-tools; all licenses accepted)
- `env.bat` — sets JAVA_HOME / ANDROID_HOME / PATH for a build shell

Signing key: `C:\Users\Ali Irfan\cashbook-release.keystore`, alias `cashbook`.
The passwords are in `frontend/android/keystore.properties` (gitignored).
**Back both up** and reuse the same keystore for every future update — Android
refuses to update an installed app signed with a different key.

## Rebuilding the APK

```
cd frontend
npm install
npm run build
npx cap sync android
call C:\Users\Ali Irfan\AppData\Local\cashbook-build\env.bat
cd android
gradlew.bat assembleRelease
:: output: android\app\build\outputs\apk\release\app-release.apk
```

`gradlew.bat assembleDebug` builds a debug APK (needs the debug Android
runtime; not used for distribution).

## iOS (needs a Mac)

Windows can generate and sync the project, but building and signing the IPA
requires macOS with Xcode:

1. Copy the repository (or at least `frontend/`) to a Mac.
2. `npm install && npm run build && npx cap sync ios`
3. Open `frontend/ios/App/App.xcworkspace` in Xcode.
4. Set a development team in Signing & Capabilities (Apple ID is enough for
   Ad Hoc/personal device installs; the Apple Developer Program is needed for
   wider distribution).
5. Run `App` on a device via Xcode, or archive it for distribution.
6. Camera/microphone usage strings: if Xcode complains or the app is
   submitted, add `NSCameraUsageDescription` and `NSMicrophoneUsageDescription`
   to `ios/App/App/Info.plist`.

## Alternative architecture (bundled web assets)

Bundling `dist/` into the app (the standard Capacitor layout, offline-capable
login screen) is possible but the server would have to change first, because
the webview origin becomes `https://localhost` (Android) / `capacitor://localhost`
(iOS), which is cross-site to the API:

```
CASHBOOK_COOKIE_SAMESITE=none
CASHBOOK_CORS_ORIGINS=https://13.202.242.159,https://localhost,capacitor://localhost
```

plus backend code changes (CORS middleware in production — currently
local-only — and the CSRF token returned in the login response body, since a
cross-origin page cannot read the server's `cashbook_csrf` cookie). An admin
with SSH access to the instance must apply the env change; this machine only
holds the restricted CI deployment key. Until then, the remote-URL shell above
is the supported configuration.
