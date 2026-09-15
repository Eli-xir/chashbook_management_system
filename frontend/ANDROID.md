# Android build (Capacitor)

The web app is the product; Capacitor wraps the same build for Android. The
Android **platform code has been prepared but no APK has been built or tested**
— this machine has neither the Android SDK nor a JDK (see "What is missing").

## One-time setup on a machine with Android tooling

1. Install JDK 17 (`JAVA_HOME` set) and Android Studio (or the Android SDK
   command-line tools; `ANDROID_HOME` set). Accept licenses:
   `sdkmanager --licenses`.
2. From `frontend/`:
   ```
   npm install
   npm run build          # produces dist/
   npx cap add android    # generates the android/ project
   npx cap sync
   ```
3. Debug APK:
   ```
   cd android
   gradlew assembleDebug
   # output: android/app/build/outputs/apk/debug/app-debug.apk
   ```

## Pointing the app at your backend

The webview runs on the `https://localhost` origin, so relative `/api` calls
cannot reach a backend on another host. Set the backend URL at build time:

```
# frontend/.env.production (or shell env when building)
VITE_API_BASE=https://your-backend-host
```

Then rebuild (`npm run build && npx cap sync`). The backend must be served over
HTTPS in this configuration and started with:

```
CASHBOOK_ENV=production
CASHBOOK_COOKIE_SAMESITE=none        # cross-origin cookies from https://localhost
CASHBOOK_CORS_ORIGINS=https://localhost
```

For quick LAN testing without HTTPS, change `server.url` in
`capacitor.config.ts` to `http://<your-LAN-IP>:8000` and run the backend with
`CASHBOOK_ENV=local` — but note this serves the **dev backend** origin, not a
production configuration, and cookie `Secure` flags are off in local mode.

## What is missing on this machine (honest status)

- JDK 17 and the Android SDK are not installed, so `npx cap add android`,
  `gradlew assembleDebug`, and any on-device testing have **not** been run.
- Camera/gallery/voice recording run through standard HTML inputs and
  MediaRecorder in the webview; native permission prompts were **not** tested
  on a device. If the webview does not surface them, add
  `@capacitor/camera`/`@capacitor/microphone` equivalents and remap the
  pickers in `ImageStep.tsx`/`VoiceStep.tsx`.
- The Android hardware Back button maps to the browser history API the same
  way as desktop browser Back; this was verified in the browser but **not** on
  an Android device.

## Signing a release APK (production path)

1. Generate a keystore once and keep it + passwords OUT of git:
   `keytool -genkey -v -keystore cashbook.keystore -alias cashbook -keyalg RSA -keysize 2048 -validity 10000`
2. Configure `android/app/build.gradle` signingConfigs with those values
   (e.g. via a local `keystore.properties`).
3. `gradlew assembleRelease` — distribute the APK directly for office use and
   reuse the same keystore for every future update.
