import { App as CapacitorApp } from '@capacitor/app';
import { useSettingsStore } from '../stores/settingsStore';
import { refreshStoredPalette } from './dynamicColors';
import { isNativePlatform } from './platform';

// Reads the current wallpaper palette from native, so a changed wallpaper is
// picked up on start and whenever the app returns to the foreground.
async function syncDynamicColors() {
  const palette = await refreshStoredPalette();
  const store = useSettingsStore.getState();
  store.setDynamicColorsSupported(palette !== null);
  store.refreshTheme();
}

export function initDynamicColors() {
  if (!isNativePlatform()) return;
  void syncDynamicColors();
  CapacitorApp.addListener('resume', () => {
    void syncDynamicColors();
  });
  // "System" theme mode: follow the device switching light/dark while the app is open,
  // so the status bar icons and window background do not lag behind until the next resume.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    useSettingsStore.getState().refreshTheme();
  });
}
