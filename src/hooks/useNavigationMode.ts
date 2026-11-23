import { useSyncExternalStore } from 'react';

export type NavigationMode = 'rail-right' | 'bottom-floating' | 'bottom-mobile';

/**
 * Determines navigation bar display mode:
 * - 'rail-right': Large screen in landscape orientation with side gutters (floating vertical rail on the right)
 * - 'bottom-floating': Large screen in portrait orientation (floating horizontal bar at the bottom with rounded corners and margins)
 *                      or landscape with narrow width where side space is insufficient
 * - 'bottom-mobile': Compact mobile screens in portrait (standard edge-to-edge bottom bar)
 */
export function getNavigationMode(): NavigationMode {
  if (typeof window === 'undefined') return 'bottom-mobile';

  const width = window.innerWidth;
  const height = window.innerHeight;
  const isLandscape = width > height;
  const isLargeScreen = width >= 640;

  // The main layout has max-w-5xl (1024px) centered with mx-auto.
  // At width >= 1150px, each side gutter is (width - 1024) / 2 >= 63px,
  // providing ample margin on both left and right for a floating vertical rail.
  const hasSideSpace = width >= 1150;

  if (isLandscape && hasSideSpace) {
    return 'rail-right';
  }

  if (isLargeScreen) {
    return 'bottom-floating';
  }

  return 'bottom-mobile';
}

function getServerSnapshot(): NavigationMode {
  return 'bottom-mobile';
}

function subscribe(callback: () => void) {
  window.addEventListener('resize', callback);
  window.addEventListener('orientationchange', callback);

  const mediaQuery = window.matchMedia('(orientation: landscape)');
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', callback);
  }

  if (typeof screen !== 'undefined' && screen.orientation?.addEventListener) {
    screen.orientation.addEventListener('change', callback);
  }

  return () => {
    window.removeEventListener('resize', callback);
    window.removeEventListener('orientationchange', callback);
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', callback);
    }
    if (typeof screen !== 'undefined' && screen.orientation?.removeEventListener) {
      screen.orientation.removeEventListener('change', callback);
    }
  };
}

export function useNavigationMode(): NavigationMode {
  return useSyncExternalStore(subscribe, getNavigationMode, getServerSnapshot);
}
