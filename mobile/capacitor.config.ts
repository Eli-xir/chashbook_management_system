import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Hosted-wrapper configuration: the WebView loads the production Vercel site
 * directly, so cookies, /api proxying and all existing frontend code work
 * unchanged (the app stays first-party to the Vercel origin).
 *
 * To switch to bundled web assets later, replace server.url with webDir and
 * keep VITE_API_BASE_URL pointed at an absolute /api URL — this requires
 * relaxing the backend's SameSite=Strict cookies, so it is not the default.
 */
const config: CapacitorConfig = {
  appId: 'com.sohailmalikarchitects.cashbook',
  appName: 'Sohail Management',
  webDir: 'www',
  server: {
    url: 'https://sohail-malik-architect-management.vercel.app',
    // Required so Capacitor injects its native bridge into the remote page.
    allowNavigation: ['sohail-malik-architect-management.vercel.app'],
  },
  android: {
    // The frontend uses getUserMedia/MediaRecorder for voice notes.
    webContentsDebuggingEnabled: false,
  },
};

export default config;
