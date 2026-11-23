import { App as CapacitorApp } from '@capacitor/app';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { dismissTopOverlay } from './backDismiss';
import { isNativePlatform } from './platform';

// Order: open overlay, drawer, previous screen (browser history), then exit
// from the home or login screen.
export function initBackButton() {
  if (!isNativePlatform()) return;

  CapacitorApp.addListener('backButton', () => {
    if (dismissTopOverlay()) return;

    const { isDrawerOpen, activeScreen, setDrawerOpen } = useSettingsStore.getState();
    if (isDrawerOpen) {
      setDrawerOpen(false);
      return;
    }

    const { isAuthenticated, isMockMode } = useAuthStore.getState();
    const onRootScreen =
      activeScreen === 'home' || activeScreen === 'login' || (!isAuthenticated && !isMockMode);
    if (onRootScreen) {
      CapacitorApp.exitApp();
      return;
    }

    window.history.back();
  });
}
