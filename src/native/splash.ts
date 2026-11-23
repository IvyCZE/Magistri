import { SplashScreen } from '@capacitor/splash-screen';
import { isNativePlatform } from './platform';

// The native splash is held until React has rendered, so the WebView's
// background colour never shows (it can differ from the app theme). The
// launch duration in capacitor.config.ts is the upper bound if this never runs.
export function hideSplash() {
  if (!isNativePlatform()) return;
  SplashScreen.hide({ fadeOutDuration: 150 }).catch(() => {});
}
