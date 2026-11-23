import { create } from 'zustand';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { isNativePlatform } from '../native/platform';
import { setNativeWindowBackground } from '../native/bridge';
import { applyDynamicPalette, clearDynamicPalette, loadStoredPalette } from '../native/dynamicColors';
import { Language, translations } from '../i18n/translations';

export type AccentColor = 'sakura' | 'lavender' | 'ocean' | 'emerald' | 'amber' | 'dynamic';
export type ThemeMode = 'dark' | 'light' | 'system';
export type MobileLayoutMode = 'sideBySide' | 'stacked';
export type TimetableLayoutMode = 'vertical' | 'horizontal' | 'day';

export type CountdownMode =
  | 'lesson_time'
  | 'day_time'
  | 'lesson_percent'
  | 'day_percent';

export type WidgetKey =
  | 'countdown'
  | 'timetable'
  | 'recentMarks'
  | 'homework'
  | 'messages'
  | 'events';

export const DEFAULT_WIDGET_ORDER: WidgetKey[] = [
  'countdown',
  'timetable',
  'recentMarks',
  'homework',
  'messages',
  'events',
];

export type BottomNavItemKey =
  | 'home'
  | 'marks'
  | 'timetable'
  | 'homework'
  | 'messages'
  | 'events'
  | 'absence'
  | 'substitutions';

export const DEFAULT_BOTTOM_NAV_ORDER: BottomNavItemKey[] = [
  'home',
  'marks',
  'timetable',
  'homework',
  'messages',
  'events',
  'absence',
  'substitutions',
];

export const DEFAULT_BOTTOM_NAV_ENABLED: Record<BottomNavItemKey, boolean> = {
  home: true,
  marks: true,
  timetable: true,
  homework: true,
  messages: true,
  events: false,
  absence: false,
  substitutions: false,
};

export type NotificationCategory = 'marks' | 'messages' | 'timetable' | 'homework';

/** Background checks (and so notifications) pause during this time of night. */
export interface NightRest {
  enabled: boolean;
  /** Minutes after midnight. */
  start: number;
  end: number;
}

export const DEFAULT_NOTIFICATIONS: Record<NotificationCategory, boolean> = {
  marks: true,
  messages: true,
  timetable: true,
  homework: true,
};

export const DEFAULT_NIGHT_REST: NightRest = { enabled: true, start: 22 * 60, end: 5 * 60 + 30 };

export interface WidgetSettings {
  countdown: boolean;
  recentMarks: boolean;
  homework: boolean;
  messages: boolean;
  events: boolean;
  timetable: boolean;
}

interface SettingsState {
  language: Language;
  themeMode: ThemeMode;
  accentColor: AccentColor;
  dynamicColorsSupported: boolean;
  amoled: boolean;
  mobileLayoutMode: MobileLayoutMode;
  timetableLayout: TimetableLayoutMode;
  widgets: WidgetSettings;
  widgetOrder: WidgetKey[];
  bottomNavOrder: BottomNavItemKey[];
  bottomNavEnabled: Record<BottomNavItemKey, boolean>;
  countdownMode: CountdownMode;
  countdownHideDecimals: boolean;
  notifications: Record<NotificationCategory, boolean>;
  nightRest: NightRest;
  activeScreen: string;
  isDrawerOpen: boolean;
  
  setLanguage: (lang: Language) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (accent: AccentColor) => void;
  setDynamicColorsSupported: (supported: boolean) => void;
  refreshTheme: () => void;
  setAmoled: (enabled: boolean) => void;
  setMobileLayoutMode: (mode: MobileLayoutMode) => void;
  setTimetableLayout: (layout: TimetableLayoutMode) => void;
  toggleWidget: (key: keyof WidgetSettings) => void;
  setWidgetOrder: (order: WidgetKey[]) => void;
  moveWidget: (fromIndex: number, toIndex: number) => void;
  setBottomNavOrder: (order: BottomNavItemKey[]) => void;
  moveBottomNavItem: (fromIndex: number, toIndex: number) => void;
  toggleBottomNavItem: (key: BottomNavItemKey) => void;
  setCountdownMode: (mode: CountdownMode) => void;
  setCountdownHideDecimals: (hide: boolean) => void;
  setNotificationEnabled: (category: NotificationCategory, enabled: boolean) => void;
  setNightRest: (nightRest: Partial<NightRest>) => void;
  setActiveScreen: (screen: string) => void;
  setDrawerOpen: (open: boolean) => void;
  t: (key: keyof typeof translations.cs, params?: Record<string, string | number>) => string;
}

// ---------------------------------------------------------------------------
// In-app navigation (back gesture / browser back support)
//
// The active screen is mirrored into the URL hash (#/marks, #/timetable, ...)
// and every screen change pushes a real history entry. The back gesture then
// walks through visited screens instead of leaving the page. Deep links like
// /#/timetable work on load. The drawer pushes a marker entry so back simply
// closes it instead of navigating away.
// ---------------------------------------------------------------------------
const KNOWN_SCREENS = [
  'home', 'login', 'marks', 'timetable', 'homework', 'messages', 'events',
  'absence', 'substitutions', 'subjects', 'teaching', 'infochannel', 'settings',
  'message-detail', 'new-message',
];

const screenFromHash = (): string => {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return KNOWN_SCREENS.includes(raw) ? raw : 'home';
};

// Sync the store from the URL hash (called on back/forward navigation).
const applyScreenFromHash = () => {
  const screen = screenFromHash();
  const st = useSettingsStore.getState();
  if (st.activeScreen !== screen) {
    useSettingsStore.setState({ activeScreen: screen, isDrawerOpen: false });
    window.scrollTo({ top: 0 });
  }
};

export const useSettingsStore = create<SettingsState>((set, get) => {
  // Load saved preferences from localStorage
  const savedLang = (localStorage.getItem('b_lang') as Language) || 'cs';
  const savedTheme = (localStorage.getItem('b_theme') as ThemeMode) || 'dark';
  const storedAccent = localStorage.getItem('b_accent');
  const dynamicAvailable = isNativePlatform() && loadStoredPalette() !== null;
  const savedAccent: AccentColor =
    storedAccent && ['sakura', 'lavender', 'ocean', 'emerald', 'amber'].includes(storedAccent)
      ? (storedAccent as AccentColor)
      : storedAccent === 'dynamic' && dynamicAvailable
        ? 'dynamic'
        : 'ocean';
  const savedAmoled = localStorage.getItem('b_amoled') === 'true';
  const savedLayout = (localStorage.getItem('b_layout') as MobileLayoutMode) || 'stacked';
  const rawTimetableLayout = localStorage.getItem('b_timetable_layout');
  const savedTimetableLayout: TimetableLayoutMode =
    rawTimetableLayout === 'vertical' || rawTimetableLayout === 'horizontal' || rawTimetableLayout === 'day'
      ? rawTimetableLayout
      : 'horizontal';
  const savedCountdownMode = (localStorage.getItem('b_countdown_mode') as CountdownMode) || 'lesson_time';
  const savedCountdownHideDecimals = localStorage.getItem('b_countdown_hide_decimals') === 'true';
  
  let savedNotifications = DEFAULT_NOTIFICATIONS;
  let savedNightRest = DEFAULT_NIGHT_REST;
  try {
    const raw = localStorage.getItem('b_notifications');
    if (raw) savedNotifications = { ...DEFAULT_NOTIFICATIONS, ...JSON.parse(raw) };
    const rawNight = localStorage.getItem('b_night_rest');
    if (rawNight) savedNightRest = { ...DEFAULT_NIGHT_REST, ...JSON.parse(rawNight) };
  } catch {}

  let savedWidgets: WidgetSettings = {
    countdown: true,
    recentMarks: true,
    homework: true,
    messages: true,
    events: true,
    timetable: true,
  };
  try {
    const rawWidgets = localStorage.getItem('b_widgets');
    if (rawWidgets) savedWidgets = { ...savedWidgets, ...JSON.parse(rawWidgets) };
  } catch {}

  let savedWidgetOrder: WidgetKey[] = DEFAULT_WIDGET_ORDER;
  try {
    const rawOrder = localStorage.getItem('b_widget_order');
    if (rawOrder) {
      const parsed = JSON.parse(rawOrder) as WidgetKey[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter(k => DEFAULT_WIDGET_ORDER.includes(k));
        const missing = DEFAULT_WIDGET_ORDER.filter(k => !valid.includes(k));
        savedWidgetOrder = [...valid, ...missing];
      }
    }
  } catch {}

  let savedBottomNavOrder: BottomNavItemKey[] = DEFAULT_BOTTOM_NAV_ORDER;
  try {
    const rawOrder = localStorage.getItem('b_bottom_nav_order');
    if (rawOrder) {
      const parsed = JSON.parse(rawOrder) as BottomNavItemKey[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter(k => DEFAULT_BOTTOM_NAV_ORDER.includes(k));
        const missing = DEFAULT_BOTTOM_NAV_ORDER.filter(k => !valid.includes(k));
        savedBottomNavOrder = [...valid, ...missing];
      }
    }
  } catch {}

  let savedBottomNavEnabled: Record<BottomNavItemKey, boolean> = DEFAULT_BOTTOM_NAV_ENABLED;
  try {
    const rawEnabled = localStorage.getItem('b_bottom_nav_enabled');
    if (rawEnabled) {
      savedBottomNavEnabled = { ...DEFAULT_BOTTOM_NAV_ENABLED, ...JSON.parse(rawEnabled) };
    }
  } catch {}

  // Enforce min 3 and max 5 active items
  const activeCount = Object.values(savedBottomNavEnabled).filter(Boolean).length;
  if (activeCount < 3 || activeCount > 5) {
    const adjusted = { ...savedBottomNavEnabled };
    if (activeCount > 5) {
      let count = 0;
      for (const key of savedBottomNavOrder) {
        if (adjusted[key]) {
          count++;
          if (count > 5) adjusted[key] = false;
        }
      }
    } else if (activeCount < 3) {
      let count = activeCount;
      for (const key of savedBottomNavOrder) {
        if (!adjusted[key] && count < 3) {
          adjusted[key] = true;
          count++;
        }
      }
    }
    savedBottomNavEnabled = adjusted;
  }

  // Apply initial DOM classes
  applyThemeToDom(savedTheme, savedAccent, savedAmoled);

  return {
    language: savedLang,
    themeMode: savedTheme,
    accentColor: savedAccent,
    amoled: savedAmoled,
    mobileLayoutMode: savedLayout,
    timetableLayout: savedTimetableLayout,
    widgets: savedWidgets,
    widgetOrder: savedWidgetOrder,
    bottomNavOrder: savedBottomNavOrder,
    bottomNavEnabled: savedBottomNavEnabled,
    countdownMode: savedCountdownMode,
    countdownHideDecimals: savedCountdownHideDecimals,
    notifications: savedNotifications,
    nightRest: savedNightRest,
    activeScreen: screenFromHash(),
    isDrawerOpen: false,
    dynamicColorsSupported: dynamicAvailable,

    setLanguage: (lang) => {
      localStorage.setItem('b_lang', lang);
      set({ language: lang });
    },

    setThemeMode: (mode) => {
      localStorage.setItem('b_theme', mode);
      set({ themeMode: mode });
      applyThemeToDom(mode, get().accentColor, get().amoled);
    },

    setAccentColor: (accent) => {
      localStorage.setItem('b_accent', accent);
      set({ accentColor: accent });
      applyThemeToDom(get().themeMode, accent, get().amoled);
    },

    setDynamicColorsSupported: (supported) => {
      set({ dynamicColorsSupported: supported });
      if (!supported && get().accentColor === 'dynamic') {
        get().setAccentColor('ocean');
      }
    },

    refreshTheme: () => {
      applyThemeToDom(get().themeMode, get().accentColor, get().amoled);
    },

    setAmoled: (enabled) => {
      localStorage.setItem('b_amoled', String(enabled));
      set({ amoled: enabled });
      applyThemeToDom(get().themeMode, get().accentColor, enabled);
    },

    setMobileLayoutMode: (mode) => {
      localStorage.setItem('b_layout', mode);
      set({ mobileLayoutMode: mode });
    },

    setTimetableLayout: (layout) => {
      localStorage.setItem('b_timetable_layout', layout);
      set({ timetableLayout: layout });
    },

    toggleWidget: (key) => {
      const updated = { ...get().widgets, [key]: !get().widgets[key] };
      localStorage.setItem('b_widgets', JSON.stringify(updated));
      set({ widgets: updated });
    },

    setWidgetOrder: (order) => {
      localStorage.setItem('b_widget_order', JSON.stringify(order));
      set({ widgetOrder: order });
    },

    moveWidget: (fromIndex, toIndex) => {
      const current = [...get().widgetOrder];
      if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) return;
      const [removed] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, removed);
      localStorage.setItem('b_widget_order', JSON.stringify(current));
      set({ widgetOrder: current });
    },

    setBottomNavOrder: (order) => {
      localStorage.setItem('b_bottom_nav_order', JSON.stringify(order));
      set({ bottomNavOrder: order });
    },

    moveBottomNavItem: (fromIndex, toIndex) => {
      const current = [...get().bottomNavOrder];
      if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) return;
      const [removed] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, removed);
      localStorage.setItem('b_bottom_nav_order', JSON.stringify(current));
      set({ bottomNavOrder: current });
    },

    toggleBottomNavItem: (key) => {
      const current = get().bottomNavEnabled;
      const isCurrentlyEnabled = current[key];
      const enabledCount = Object.values(current).filter(Boolean).length;
      // Minimum 3 items
      if (isCurrentlyEnabled && enabledCount <= 3) {
        return;
      }
      // Maximum 5 items
      if (!isCurrentlyEnabled && enabledCount >= 5) {
        return;
      }
      const updated = { ...current, [key]: !isCurrentlyEnabled };
      localStorage.setItem('b_bottom_nav_enabled', JSON.stringify(updated));
      set({ bottomNavEnabled: updated });
    },

    setCountdownMode: (mode) => {
      localStorage.setItem('b_countdown_mode', mode);
      set({ countdownMode: mode });
    },

    setCountdownHideDecimals: (hide) => {
      localStorage.setItem('b_countdown_hide_decimals', String(hide));
      set({ countdownHideDecimals: hide });
    },

    setNotificationEnabled: (category, enabled) => {
      const updated = { ...get().notifications, [category]: enabled };
      localStorage.setItem('b_notifications', JSON.stringify(updated));
      set({ notifications: updated });
    },

    setNightRest: (partial) => {
      const updated = { ...get().nightRest, ...partial };
      localStorage.setItem('b_night_rest', JSON.stringify(updated));
      set({ nightRest: updated });
    },

    setActiveScreen: (screenWithParams) => {
      // Mirror the screen into the URL hash → this pushes a history entry,
      // so the back gesture walks back through visited screens.
      const target = `#/${screenWithParams}`;
      const baseScreen = screenWithParams.split('?')[0];
      if (window.location.hash !== target) {
        window.location.hash = target;
      }
      set({ activeScreen: baseScreen, isDrawerOpen: false });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    setDrawerOpen: (open) => {
      if (open) {
        // Marker history entry: the back gesture then only closes the
        // drawer instead of navigating away from the current screen.
        history.pushState({ drawer: true }, '', window.location.href);
        set({ isDrawerOpen: true });
      } else {
        set({ isDrawerOpen: false });
        // Consume the marker entry pushed when the drawer was opened.
        if (history.state && (history.state as any).drawer) {
          history.back();
        }
      }
    },

    t: (key, params) => {
      const lang = get().language;
      const dict = translations[lang] || translations.cs;
      let text = (dict as any)[key] || (translations.cs as any)[key] || key;
      if (params) {
        Object.entries(params).forEach(([pKey, pVal]) => {
          text = text.replace(new RegExp(`{{${pKey}}}`, 'g'), String(pVal));
        });
      }
      return text;
    },
  };
});

// Canonical URL for the initial entry (deep links like /#/marks work on load)
if (!window.location.hash) {
  history.replaceState(null, '', '#/home');
}

// Back / forward navigation → sync the active screen from the URL hash.
window.addEventListener('popstate', (event) => {
  const st = useSettingsStore.getState();
  if (st.isDrawerOpen) {
    // The popped entry was the drawer marker → just close the drawer.
    useSettingsStore.setState({ isDrawerOpen: false });
    return;
  }
  // Skip phantom drawer entries left behind by drawer navigation.
  if (event.state && (event.state as any).drawer) {
    history.back();
    return;
  }
  applyScreenFromHash();
});
window.addEventListener('hashchange', applyScreenFromHash);

function applyThemeToDom(theme: ThemeMode, accent: AccentColor, amoled: boolean) {
  const root = document.documentElement;
  
  // Theme mode (dark vs light)
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (isDark) {
    root.classList.add('dark');
    root.setAttribute('data-theme-mode', 'dark');
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme-mode', 'light');
  }

  // Accent palette. "dynamic" overrides the variables inline from the wallpaper
  // palette; without a palette it falls back to the default accent.
  const dynamicPalette = accent === 'dynamic' ? loadStoredPalette() : null;
  root.setAttribute('data-accent', accent === 'dynamic' && !dynamicPalette ? 'ocean' : accent);

  // AMOLED mode
  root.setAttribute('data-amoled', String(amoled && isDark));

  if (dynamicPalette) {
    applyDynamicPalette(dynamicPalette, isDark, amoled);
  } else {
    clearDynamicPalette();
  }

  syncSystemChrome(isDark);
}

// Keeps the browser theme color and the Android status/navigation bar icons in
// step with the app theme, which can differ from the system theme.
function syncSystemChrome(isDark: boolean) {
  const surface = getComputedStyle(document.documentElement).getPropertyValue('--m3-surface').trim();
  if (surface) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface);
  }
  if (isNativePlatform()) {
    if (surface) void setNativeWindowBackground(surface);
    SystemBars.setStyle({ style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  }
}
