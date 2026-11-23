import { getDynamicPalette, NativePalette } from './bridge';

export interface StoredDynamicPalette {
  light: NativePalette;
  dark: NativePalette;
}

const STORAGE_KEY = 'b_dynamic_palette';

// Material 3 role name (from the native plugin) to the CSS variable used by the app.
const ROLE_TO_VAR: Record<string, string> = {
  primary: '--m3-primary',
  onPrimary: '--m3-on-primary',
  primaryContainer: '--m3-primary-container',
  onPrimaryContainer: '--m3-on-primary-container',
  secondary: '--m3-secondary',
  onSecondary: '--m3-on-secondary',
  secondaryContainer: '--m3-secondary-container',
  onSecondaryContainer: '--m3-on-secondary-container',
  tertiary: '--m3-tertiary',
  onTertiary: '--m3-on-tertiary',
  tertiaryContainer: '--m3-tertiary-container',
  onTertiaryContainer: '--m3-on-tertiary-container',
  error: '--m3-error',
  onError: '--m3-on-error',
  errorContainer: '--m3-error-container',
  onErrorContainer: '--m3-on-error-container',
  surface: '--m3-surface',
  onSurface: '--m3-on-surface',
  onSurfaceVariant: '--m3-on-surface-variant',
  outline: '--m3-outline',
  outlineVariant: '--m3-outline-variant',
  surfaceDim: '--m3-surface-dim',
  surfaceBright: '--m3-surface-bright',
  surfaceContainerLowest: '--m3-surface-container-lowest',
  surfaceContainerLow: '--m3-surface-container-low',
  surfaceContainer: '--m3-surface-container',
  surfaceContainerHigh: '--m3-surface-container-high',
  surfaceContainerHighest: '--m3-surface-container-highest',
};

const GLOW_VAR = '--m3-primary-glow';

// In AMOLED mode the CSS rule for [data-amoled="true"].dark owns these surfaces,
// so they are left to the stylesheet and only the accent colors come from the wallpaper.
const AMOLED_OWNED_VARS = new Set([
  '--m3-surface',
  '--m3-surface-container-lowest',
  '--m3-surface-container-low',
  '--m3-surface-container',
  '--m3-surface-container-high',
  '--m3-surface-container-highest',
]);

const ALL_VARS = [...Object.values(ROLE_TO_VAR), GLOW_VAR];

export function loadStoredPalette(): StoredDynamicPalette | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.light?.primary && parsed?.dark?.primary ? parsed : null;
  } catch {
    return null;
  }
}

const hexToRgba = (hex: string, alpha: number) => {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

export function applyDynamicPalette(palette: StoredDynamicPalette, isDark: boolean, amoled: boolean) {
  const colors = isDark ? palette.dark : palette.light;
  const style = document.documentElement.style;
  const skipSurfaces = amoled && isDark;

  for (const [role, cssVar] of Object.entries(ROLE_TO_VAR)) {
    if (skipSurfaces && AMOLED_OWNED_VARS.has(cssVar)) {
      style.removeProperty(cssVar);
    } else if (colors[role]) {
      style.setProperty(cssVar, colors[role]);
    }
  }
  style.setProperty(GLOW_VAR, hexToRgba(colors.primary, isDark ? 0.3 : 0.25));
}

export function clearDynamicPalette() {
  const style = document.documentElement.style;
  ALL_VARS.forEach((cssVar) => style.removeProperty(cssVar));
}

// Fetches the current wallpaper palette from native and caches it. Returns null
// when the device does not support dynamic colors.
export async function refreshStoredPalette(): Promise<StoredDynamicPalette | null> {
  const result = await getDynamicPalette();
  if (!result.supported || !result.light || !result.dark) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  const palette: StoredDynamicPalette = { light: result.light, dark: result.dark };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(palette));
  return palette;
}
