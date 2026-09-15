import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.cashbook.office',
  appName: 'Cashbook',
  webDir: 'dist',
  // Local development: serve the built app from the dev machine's backend.
  // For a device on the same network, replace with your machine's LAN IP.
  server: {
    // androidScheme https makes the webview origin https://localhost,
    // which matches the browser deployment and keeps cookie handling consistent.
    androidScheme: 'https',
  },
}

export default config
