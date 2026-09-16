import type { CapacitorConfig } from '@capacitor/cli'

// The mobile app is a native shell around the live deployment. The webview
// loads the server itself, so the page origin IS the API origin: cookie
// sessions, the CSRF double-submit token and camera/mic permissions behave
// exactly as in a desktop browser, and frontend fixes go live without
// reinstalling the app.
const SERVER_URL = process.env.CAP_SERVER_URL ?? 'https://13.202.242.159'

const config: CapacitorConfig = {
  appId: 'com.cashbook.office',
  appName: 'Cashbook',
  webDir: 'dist',
  server: {
    url: SERVER_URL,
    androidScheme: 'https',
  },
}

export default config
