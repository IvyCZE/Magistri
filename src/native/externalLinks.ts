import { Browser } from '@capacitor/browser';
import { isNativePlatform } from './platform';

const isExternalWebUrl = (url: URL) =>
  (url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== window.location.origin;

// The WebView does not reliably open target="_blank" links or window.open();
// route every external web URL through a Custom Tab instead. mailto: and tel:
// links are left to the default handling.
export function initExternalLinks() {
  if (!isNativePlatform()) return;

  document.addEventListener(
    'click',
    (event) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (!isExternalWebUrl(url)) return;
      event.preventDefault();
      void Browser.open({ url: url.toString() });
    },
    true,
  );

  window.open = ((target?: string | URL) => {
    if (target) {
      try {
        const url = new URL(String(target), window.location.href);
        if (isExternalWebUrl(url)) void Browser.open({ url: url.toString() });
      } catch {
        // Ignore malformed URLs.
      }
    }
    return null;
  }) as typeof window.open;
}
