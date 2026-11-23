import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CapacitorConfig } from '@capacitor/cli';

// The id and display name live in app.config.json, shared with Vite and Gradle.
const app: { appId: string; appName: string } = JSON.parse(readFileSync(resolve(process.cwd(), 'app.config.json'), 'utf-8'));

const config: CapacitorConfig = {
  appId: app.appId,
  appName: app.appName,
  webDir: 'dist',
  server: {
    // Changing androidScheme after launch resets users' WebView localStorage.
    androidScheme: 'https',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      // The splash stays until the app calls SplashScreen.hide() after its first
      // render; the duration is only the upper bound if that never happens.
      launchAutoHide: true,
      launchShowDuration: 2500,
      launchFadeOutDuration: 150,
      backgroundColor: '#0e1417',
    },
    SystemBars: {
      insetsHandling: 'css',
      // index.html uses viewport-fit=cover; saying so up front avoids a layout jump on start.
      initialViewportFitValueHint: 'cover',
    },
  },
  android: {
    backgroundColor: '#0e1417',
    webContentsDebuggingEnabled: false,
  },
};

export default config;
