import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/outfit/wght.css';
import './fonts.css';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { isNativePlatform } from './native/platform';
import { bakalariApi } from './api/client';

// Register Service Worker only when running in a web browser, never inside native Capacitor WebView
if (!isNativePlatform() && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
  });
}

async function bootstrap() {
  // Tokens may live in native storage, so they must be loaded before any store
  // is created: the stores read auth state when their modules are first imported.
  await bakalariApi.init();

  // A signed-out start renders the login screen first, so its chunk is fetched together with App.
  const signedOut = !bakalariApi.getTokens() && !bakalariApi.getIsMockMode();

  const [
    { App },
    { initBackButton },
    { initExternalLinks },
    { initDynamicColors },
    { initDeepLinks },
    { initKeyboard },
    { hideSplash },
    ,
  ] = await Promise.all([
    import('./App'),
    import('./native/backButton'),
    import('./native/externalLinks'),
    import('./native/dynamicColorsSync'),
    import('./native/deepLinks'),
    import('./native/keyboard'),
    import('./native/splash'),
    signedOut ? import('./pages/LoginPage') : undefined,
  ]);

  initBackButton();
  initExternalLinks();
  initDynamicColors();
  initDeepLinks();
  initKeyboard();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  // A timer, not requestAnimationFrame: the WebView gets no frames while the
  // splash holds the first draw, so a frame callback would never fire.
  setTimeout(hideSplash, 120);

  // Widget sync serialises the cached data, which the first frame does not need.
  setTimeout(() => {
    void import('./native/nativeSync').then(({ initNativeSync }) => initNativeSync());
  }, 600);
}

void bootstrap();
