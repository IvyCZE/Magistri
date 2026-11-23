import React, { useState, useEffect, useRef } from 'react';
import { useBackDismiss } from '../native/backDismiss';
import {
  Palette,
  Moon,
  Sun,
  Globe,
  Layout,
  Check,
  Server,
  Smartphone,
  Search,
  UserCheck,
  LogOut,
  ChevronRight,
  ArrowLeft,
  Sliders,
  Info,
  Sparkles,
  X,
  Flower2,
  Flower,
  Waves,
  Gem,
  Flame,
  GraduationCap,
  Calendar,
  CheckSquare,
  MessageSquare,
  Copy,
  GripVertical,
  Home,
  UserX,
  ArrowRightLeft,
  Timer,
  Clock,
  Percent,
  Hash,
  Pencil,
  Download,
  ShieldCheck,
  ExternalLink,
  Bell,
} from 'lucide-react';
import { useSettingsStore, AccentColor, ThemeMode, MobileLayoutMode, WidgetKey, BottomNavItemKey, CountdownMode } from '../stores/settingsStore';
import { useAuthStore, getSavedStudentName } from '../stores/authStore';
import { useConnectionStatus } from '../stores/connectionStore';
import { CONNECTION_LABEL_KEYS } from '../domain/connectionStatus';
import { bakalariApi } from '../api/client';
import { SchoolInfo, Municipality } from '../types/bakalari';
import { MaterialWavyDivider } from '../components/common/MaterialWavyDivider';
import { TranslationKey } from '../i18n/translations';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { isNativePlatform } from '../native/platform';
import { APP_NAME } from '../config/app';
import { PRIVACY_POLICY_URL } from '../config/links';
import { TestNotice } from '../components/common/TestNotice';
import { AppLogo } from '../components/common/AppLogo';
import { loadStoredPalette } from '../native/dynamicColors';
import { NotificationSettings } from '../components/settings/NotificationSettings';
import { AppIconRow, AppIconDrawer, useAppIcon } from '../components/settings/AppIconPicker';
import { groupRadius, STANDALONE_RADIUS } from '../utils/groupRadius';
import { schoolWebUrl } from '../utils/schoolWebUrl';

type SettingsTab = 'account' | 'appearance' | 'customization' | 'about' | 'language' | 'notifications';

const WIDGET_CONFIG: Record<WidgetKey, { labelKey: TranslationKey; icon: React.ComponentType<{ className?: string }> }> = {
  countdown: { labelKey: 'countdownWidget', icon: Timer },
  recentMarks: { labelKey: 'recentMarks', icon: GraduationCap },
  timetable: { labelKey: 'timetable', icon: Calendar },
  homework: { labelKey: 'homework', icon: CheckSquare },
  messages: { labelKey: 'messages', icon: MessageSquare },
  events: { labelKey: 'events', icon: Sparkles },
};

const BOTTOM_NAV_CONFIG: Record<BottomNavItemKey, { labelKey: TranslationKey; icon: React.ComponentType<{ className?: string }> }> = {
  home: { labelKey: 'home', icon: Home },
  marks: { labelKey: 'marks', icon: GraduationCap },
  timetable: { labelKey: 'timetable', icon: Calendar },
  homework: { labelKey: 'homework', icon: CheckSquare },
  messages: { labelKey: 'messages', icon: MessageSquare },
  events: { labelKey: 'events', icon: Sparkles },
  absence: { labelKey: 'absence', icon: UserX },
  substitutions: { labelKey: 'substitutions', icon: ArrowRightLeft },
};

interface ReorderableWidgetItemProps {
  widgetKey: WidgetKey;
  index: number;
  isEnabled: boolean;
  isDragging: boolean;
  count: number;
  onToggle: () => void;
  onHandlePointerDown: (index: number, e: React.PointerEvent) => void;
}

const ReorderableWidgetItem: React.FC<ReorderableWidgetItemProps> = ({
  widgetKey,
  index,
  isEnabled,
  isDragging,
  count,
  onToggle,
  onHandlePointerDown,
}) => {
  const { t } = useSettingsStore();
  const config = WIDGET_CONFIG[widgetKey];
  const Icon = config.icon;

  return (
    <div
      className={`p-4 sm:p-5 ${isDragging ? STANDALONE_RADIUS : groupRadius(index, count)} transition-all flex items-center justify-between gap-3 sm:gap-4 shadow-xs select-none relative ${
        isDragging
          ? 'bg-m3-surface-container-highest shadow-lg scale-[1.01] z-10'
          : 'bg-m3-surface-container hover:bg-m3-surface-container-high'
      }`}
    >
      <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 flex-1">
        {/* Drag handle button - dragging ONLY starts here, immediately with 0 delay */}
        <button
          type="button"
          onPointerDown={(e) => onHandlePointerDown(index, e)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-m3-on-surface-variant/40 hover:text-m3-primary active:text-m3-primary hover:bg-m3-surface-container-highest/60 transition-colors cursor-grab active:cursor-grabbing touch-none select-none shrink-0 -ml-1.5"
          title={t('dragToReorder')}
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="w-5 h-5 pointer-events-none" />
        </button>

        {/* Round backdrop icon */}
        <div className="w-12 h-12 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
          <Icon className="w-6 h-6" />
        </div>

        {/* Label */}
        <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight truncate">
          {t(config.labelKey)}
        </span>
      </div>

      {/* Right control: Toggle Switch only */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`w-12 h-7 rounded-full transition-colors flex items-center p-1 shrink-0 ${
          isEnabled ? 'bg-m3-primary justify-end' : 'bg-m3-surface-container-highest justify-start'
        }`}
        title={isEnabled ? t('disableWidget') : t('enableWidget')}
      >
        <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
      </button>
    </div>
  );
};

/**
 * Automatically scales down text to fit seamlessly in one line within its parent container.
 */
const AutoScaledText: React.FC<{
  text: string;
  className?: string;
}> = ({ text, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    const calculateScale = () => {
      textEl.style.transform = 'none';
      const availableWidth = container.clientWidth;
      const contentWidth = textEl.scrollWidth;

      if (availableWidth > 0 && contentWidth > availableWidth) {
        const newScale = Math.min(1, availableWidth / contentWidth);
        setScale(newScale);
        textEl.style.transform = `scale(${newScale})`;
      } else {
        setScale(1);
        textEl.style.transform = 'none';
      }
    };

    calculateScale();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        calculateScale();
      });
      observer.observe(container);
      return () => observer.disconnect();
    }
  }, [text]);

  return (
    <div ref={containerRef} className="w-full overflow-hidden min-w-0 flex items-center h-5">
      <span
        ref={textRef}
        className={className}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          transformOrigin: 'left center',
          transform: scale < 1 ? `scale(${scale})` : undefined,
        }}
      >
        {text}
      </span>
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  const {
    language,
    setLanguage,
    themeMode,
    setThemeMode,
    accentColor,
    setAccentColor,
    dynamicColorsSupported,
    amoled,
    setAmoled,
    widgets,
    toggleWidget,
    widgetOrder,
    setWidgetOrder,
    moveWidget,
    bottomNavOrder,
    bottomNavEnabled,
    moveBottomNavItem,
    toggleBottomNavItem,
    countdownMode,
    setCountdownMode,
    countdownHideDecimals,
    setCountdownHideDecimals,
    setActiveScreen,
    t,
  } = useSettingsStore();

  const {
    isMockMode,
    user,
    currentSchool,
    login,
    logout,
    isLoading,
    error,
    updateUserName,
  } = useAuthStore();

  const connectionStatus = useConnectionStatus();
  const { canInstall, isInstalled, install: installPwa } = usePwaInstall();

  // Helper to read initial subScreen from URL hash if present
  const getSubScreenFromHash = (): SettingsTab | null => {
    const hash = window.location.hash;
    const match = hash.match(/[?&]tab=([a-z]+)/);
    if (match && ['account', 'appearance', 'customization', 'about', 'language', ...(isNativePlatform() ? ['notifications'] : [])].includes(match[1])) {
      return match[1] as any;
    }
    return null;
  };

  const [subScreen, setSubScreen] = useState<SettingsTab | null>(getSubScreenFromHash);

  // Sync hash changes with state (for browser back / forward buttons)
  useEffect(() => {
    const handleHashChange = () => {
      setSubScreen(getSubScreenFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const openSubScreen = (screen: SettingsTab | null) => {
    if (screen) {
      window.location.hash = `#/settings?tab=${screen}`;
    } else {
      window.location.hash = '#/settings';
    }
    setSubScreen(screen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    window.location.hash = '#/settings';
    setSubScreen(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Drawers for Theme Mode and Accent Color
  const [showThemeDrawer, setShowThemeDrawer] = useState(false);
  const [showAccentDrawer, setShowAccentDrawer] = useState(false);
  useBackDismiss(showThemeDrawer, () => setShowThemeDrawer(false));
  useBackDismiss(showAccentDrawer, () => setShowAccentDrawer(false));
  const [showIconDrawer, setShowIconDrawer] = useState(false);
  useBackDismiss(showIconDrawer, () => setShowIconDrawer(false));
  const appIcon = useAppIcon();
  const appearanceRows = appIcon.icon ? 3 : 2;

  // Drag and drop reordering via pointer events (instant, no hold delay, handle only)
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null);
  const widgetListRef = useRef<HTMLDivElement>(null);

  const handleHandlePointerDown = (startIndex: number, e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only primary button (left click or touch)
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {}

    let currentIndex = startIndex;
    setActiveDragIndex(startIndex);

    const onPointerMove = (moveEvt: PointerEvent) => {
      if (!widgetListRef.current) return;
      const children = Array.from(widgetListRef.current.children) as HTMLElement[];
      const pointerY = moveEvt.clientY;

      let targetIndex = -1;
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        if (pointerY >= rect.top && pointerY <= rect.bottom) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex === -1 && children.length > 0) {
        if (pointerY < children[0].getBoundingClientRect().top) targetIndex = 0;
        else if (pointerY > children[children.length - 1].getBoundingClientRect().bottom) targetIndex = children.length - 1;
      }

      if (targetIndex !== -1 && targetIndex !== currentIndex) {
        moveWidget(currentIndex, targetIndex);
        currentIndex = targetIndex;
        setActiveDragIndex(targetIndex);
      }
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      try {
        target.releasePointerCapture(upEvt.pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      setActiveDragIndex(null);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  // Drag and drop reordering + tap toggle for bottom navigation bar items
  const [activeDragNavIndex, setActiveDragNavIndex] = useState<number | null>(null);
  const navRowRef = useRef<HTMLDivElement>(null);

  const handleNavPointerDown = (startIndex: number, key: BottomNavItemKey, e: React.PointerEvent) => {
    if (e.button !== 0) return;

    const target = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;

    let isHorizontalDrag = false;
    let isVerticalScroll = false;
    let currentIndex = startIndex;

    const cleanup = () => {
      try {
        target.releasePointerCapture(pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };

    const onPointerMove = (moveEvt: PointerEvent) => {
      if (isVerticalScroll) return;

      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // 1. Detect quick vertical scroll (user is scrolling the page up/down)
      if (!isHorizontalDrag) {
        if (absDy > 6 && absDy >= absDx) {
          isVerticalScroll = true;
          cleanup();
          return;
        }

        // 2. Detect intentional horizontal drag along the navbar dock
        if (absDx > 8 && absDx > absDy * 1.3) {
          isHorizontalDrag = true;
          try {
            target.setPointerCapture(pointerId);
          } catch {}
          setActiveDragNavIndex(currentIndex);
        }
      }

      // If intentionally dragging horizontally on the navbar:
      if (isHorizontalDrag) {
        if (moveEvt.cancelable) {
          moveEvt.preventDefault();
        }

        if (!navRowRef.current) return;
        const children = Array.from(navRowRef.current.children) as HTMLElement[];
        const pointerX = moveEvt.clientX;

        let targetIndex = 0;
        let minDistance = Infinity;

        for (let i = 0; i < children.length; i++) {
          const rect = children[i].getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const dist = Math.abs(pointerX - centerX);
          if (dist < minDistance) {
            minDistance = dist;
            targetIndex = i;
          }
        }

        if (targetIndex !== currentIndex) {
          moveBottomNavItem(currentIndex, targetIndex);
          currentIndex = targetIndex;
          setActiveDragNavIndex(targetIndex);
        }
      }
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      cleanup();

      // Deliberate tap only when not scrolling vertically and not dragging horizontally
      if (!isVerticalScroll && !isHorizontalDrag) {
        const totalDist = Math.hypot(upEvt.clientX - startX, upEvt.clientY - startY);
        if (totalDist < 8) {
          toggleBottomNavItem(key);
        }
      }
      setActiveDragNavIndex(null);
    };

    const onPointerCancel = () => {
      cleanup();
      setActiveDragNavIndex(null);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  };

  type DisplayThemeChoice = 'light' | 'dark' | 'amoled' | 'dynamic';

  const currentThemeChoice: DisplayThemeChoice =
    themeMode === 'system'
      ? 'dynamic'
      : amoled && themeMode === 'dark'
      ? 'amoled'
      : themeMode === 'dark'
      ? 'dark'
      : 'light';

  const themeChoices: { id: DisplayThemeChoice; label: string; title: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
    {
      id: 'light',
      label: t('themeLight'),
      title: t('themeLightTitle'),
      description: t('themeLightDesc'),
      icon: Sun,
    },
    {
      id: 'dark',
      label: t('themeDark'),
      title: t('themeDarkTitle'),
      description: t('themeDarkDesc'),
      icon: Moon,
    },
    {
      id: 'amoled',
      label: 'AMOLED',
      title: t('themeAmoledTitle'),
      description: t('themeAmoledDesc'),
      icon: Sparkles,
    },
    {
      id: 'dynamic',
      label: t('themeSystem'),
      title: t('themeDynamicTitle'),
      description: t('themeDynamicDesc'),
      icon: Smartphone,
    },
  ];

  const currentThemeInfo = themeChoices.find(tc => tc.id === currentThemeChoice) || themeChoices[1];
  const ThemeIcon = currentThemeInfo.icon;

  const handleSelectThemeChoice = (choice: DisplayThemeChoice) => {
    if (choice === 'dynamic') {
      setThemeMode('system');
      setAmoled(false);
    } else if (choice === 'amoled') {
      setThemeMode('dark');
      setAmoled(true);
    } else if (choice === 'dark') {
      setThemeMode('dark');
      setAmoled(false);
    } else if (choice === 'light') {
      setThemeMode('light');
      setAmoled(false);
    }
    setShowThemeDrawer(false);
  };

  // School search / login modal states
  const [showLoginModal, setShowLoginModal] = useState(false);
  useBackDismiss(showLoginModal, () => setShowLoginModal(false));
  const [schoolUrlInput, setSchoolUrlInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<SchoolInfo | null>(null);
  const [searchCity, setSearchCity] = useState('');
  const [cityResults, setCityResults] = useState<Municipality[]>([]);
  const [schoolResults, setSchoolResults] = useState<SchoolInfo[]>([]);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const handleSaveName = () => {
    const clean = nameInput.trim();
    if (clean) {
      updateUserName(clean);
    }
    setIsEditingName(false);
  };

  const schoolUrl = schoolWebUrl(currentSchool?.schoolUrl, user?.schoolUrl);

  const handleCopySchoolUrl = () => {
    if (navigator.clipboard && schoolUrl) {
      navigator.clipboard.writeText(schoolUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const dynamicSwatchHex = loadStoredPalette()?.[themeMode === 'light' ? 'light' : 'dark'].primary ?? '#a8c7fa';

  const accents: { id: AccentColor; label: string; title: string; desc: string; colorHex: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'sakura', label: t('sakura'), title: t('accentSakuraTitle'), desc: t('accentSakuraDesc'), colorHex: '#ffb1c8', icon: Flower2 },
    { id: 'lavender', label: t('lavender'), title: t('accentLavenderTitle'), desc: t('accentLavenderDesc'), colorHex: '#d0bcff', icon: Flower },
    { id: 'ocean', label: t('ocean'), title: t('accentOceanTitle'), desc: t('accentOceanDesc'), colorHex: '#78d2f5', icon: Waves },
    { id: 'emerald', label: t('emerald'), title: t('accentEmeraldTitle'), desc: t('accentEmeraldDesc'), colorHex: '#7adbb0', icon: Gem },
    { id: 'amber', label: t('amber'), title: t('accentAmberTitle'), desc: t('accentAmberDesc'), colorHex: '#ffb77b', icon: Flame },
    ...(dynamicColorsSupported
      ? [{ id: 'dynamic' as const, label: t('accentDynamicTitle'), title: t('accentDynamicTitle'), desc: '', colorHex: dynamicSwatchHex, icon: Sparkles }]
      : []),
  ];

  const currentAccentInfo = accents.find(a => a.id === accentColor) || accents[0];
  const AccentIcon = currentAccentInfo.icon;

  const handleSearchCities = async () => {
    const cities = await bakalariApi.searchMunicipalities();
    setCityResults(cities.filter(c => c.name.toLowerCase().includes(searchCity.toLowerCase())));
  };

  const handleSelectCity = async (cityName: string) => {
    const schools = await bakalariApi.getSchoolsByMunicipality(cityName);
    setSchoolResults(schools);
  };

  const handlePerformLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = selectedSchool ? selectedSchool.schoolUrl : schoolUrlInput;
    const name = selectedSchool ? selectedSchool.name : t('school');
    const success = await login(url, usernameInput, passwordInput, name);
    if (success) {
      setShowLoginModal(false);
    }
  };

  // Definition of the 5 requested settings tabs
  const settingTabs = [
    {
      id: 'appearance' as const,
      title: t('appearance'),
      description: `${currentThemeInfo.label} • ${currentAccentInfo.label}`,
      icon: Palette,
    },
    {
      id: 'customization' as const,
      title: t('customization'),
      description: t('customizationDesc'),
      icon: Sliders,
    },
    ...(isNativePlatform()
      ? [{ id: 'notifications' as const, title: t('notifications'), description: t('notificationsDesc'), icon: Bell }]
      : []),
    {
      id: 'language' as const,
      title: t('language'),
      description: language === 'cs' ? 'Čeština 🇨🇿' : 'English 🇬🇧',
      icon: Globe,
    },
    {
      id: 'account' as const,
      title: t('accountAndSchool'),
      description: user?.name
        ? `${user.name} (${user.className || '3.B'}) • ${isMockMode ? t('demoProfile') : (currentSchool?.name || user.schoolName || t('connectedToApi'))}`
        : t('accountDesc'),
      icon: UserCheck,
    },
    {
      id: 'about' as const,
      title: t('aboutApp'),
      description: `${APP_NAME} ${__APP_VERSION__}`,
      icon: Info,
    },
  ];

  const currentTab = settingTabs.find(t => t.id === subScreen);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-5 flex flex-col gap-6">
      {/* 1. Main Settings List (when subScreen === null) */}
      {subScreen === null && (
        <>
          {/* Page Header */}
          <div className="px-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-m3-on-surface">
              {t('settings')}
            </h1>
          </div>

          {/* List of 5 Settings Tabs */}
          <div className="flex flex-col gap-1.5">
            {settingTabs.map((tab, tabIndex) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => openSubScreen(tab.id)}
                  className={`w-full p-4 sm:p-5 ${groupRadius(tabIndex, settingTabs.length)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex items-center justify-between gap-4 text-left m3-pressable shadow-xs group`}
                >
                  <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight truncate">
                      {tab.title}
                    </span>
                  </div>

                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-m3-on-surface-variant/70 group-hover:text-m3-primary group-hover:translate-x-0.5 transition-all shrink-0">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* 2. Sub-screens (when subScreen !== null) */}
      {subScreen !== null && (
        <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-200">
          {/* Subscreen Header with Back Button */}
          <div className="flex items-center gap-3.5 px-1">
            <button
              onClick={goBack}
              className="w-10 h-10 rounded-full bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface flex items-center justify-center shrink-0 m3-pressable transition-all shadow-xs"
              title={t('backToSettings')}
              aria-label={t('backToSettings')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold font-display text-m3-on-surface leading-tight truncate">
                {currentTab?.title}
              </h1>
            </div>
          </div>

          {subScreen === 'notifications' && <NotificationSettings />}

          {/* Subscreen 1: Účet a škola */}
          {subScreen === 'account' && (
            <div className="flex flex-col gap-1.5">
              {/* Stav přihlášení Card */}
              <div className={`w-full p-4 sm:p-5 ${groupRadius(0, 3)} bg-m3-surface-container flex items-center justify-between gap-4 shadow-xs`}>
                <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shrink-0 shadow-2xs">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight truncate">
                    {t('loginStatus')}
                  </span>
                </div>

                {(() => {
                  const tone = isMockMode || connectionStatus === 'offline' || connectionStatus === 'outage'
                    ? 'text-amber-600 dark:text-amber-400'
                    : connectionStatus === 'signedOut'
                      ? 'text-m3-error'
                      : 'text-m3-primary';
                  const label = isMockMode
                    ? t('demoProfile')
                    : connectionStatus === 'ok'
                      ? t('signedInStatus')
                      : t(CONNECTION_LABEL_KEYS[connectionStatus]);
                  return (
                    <span className={`text-sm font-bold font-display shrink-0 ${tone}`}>{label}</span>
                  );
                })()}
              </div>

              {/* 1. User Profile Card */}
              {(() => {
                const effectiveName = user?.name?.trim() || getSavedStudentName() || (isMockMode ? 'Demo Student' : 'Student');
                const initials = effectiveName.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2) || (user?.className || 'ST');

                return (
                  <div className={`w-full p-4 sm:p-5 ${groupRadius(1, 3)} bg-m3-surface-container flex items-center justify-between gap-3.5 sm:gap-4 shadow-xs`}>
                    <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded-full bg-m3-primary-container text-m3-on-primary-container font-black font-display flex items-center justify-center text-base shrink-0 shadow-2xs">
                        {initials}
                      </div>
                      {isEditingName ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            placeholder="Jméno a příjmení"
                            className="flex-1 px-3.5 py-1.5 rounded-full bg-m3-surface-container-high text-m3-on-surface text-sm font-bold border border-m3-outline/20 focus:outline-none focus:ring-2 focus:ring-m3-primary"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveName();
                              if (e.key === 'Escape') setIsEditingName(false);
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleSaveName}
                            className="p-2 rounded-full bg-m3-primary text-m3-on-primary hover:bg-m3-primary/90 transition-colors shrink-0"
                            title="Uložit"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingName(false)}
                            className="p-2 rounded-full bg-m3-surface-container-high text-m3-on-surface-variant hover:bg-m3-surface-container-highest transition-colors shrink-0"
                            title="Zrušit"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight truncate">
                              {effectiveName}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setNameInput(effectiveName === 'Student' || effectiveName === 'Demo Student' ? '' : effectiveName);
                                setIsEditingName(true);
                              }}
                              className="p-1 rounded-full text-m3-on-surface-variant/60 hover:text-m3-primary hover:bg-m3-surface-container-high transition-colors"
                              title="Upravit jméno"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="text-xs sm:text-sm text-m3-on-surface-variant truncate mt-0.5">
                            {user?.className ? `${user.className} • ` : ''}{currentSchool?.name || user?.schoolName || ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 2. School URL Copy Button */}
              <button
                type="button"
                onClick={handleCopySchoolUrl}
                className={`w-full p-4 sm:p-5 ${groupRadius(2, 3)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex items-center justify-between gap-3 sm:gap-4 text-left m3-pressable shadow-xs group min-w-0`}
                title={t('clickToCopyUrl')}
              >
                <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                    <Globe className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight truncate">
                      {t('schoolUrlLabel')}
                    </span>
                    <AutoScaledText
                      text={schoolUrl}
                      className="text-xs sm:text-sm text-m3-on-surface-variant font-mono group-hover:text-m3-primary transition-colors"
                    />
                  </div>
                </div>

                <div className="w-10 h-10 rounded-full bg-m3-surface-container-high text-m3-on-surface-variant group-hover:bg-m3-primary group-hover:text-m3-on-primary flex items-center justify-center transition-all shrink-0 shadow-2xs">
                  {copiedUrl ? (
                    <Check className="w-5 h-5 text-emerald-500 group-hover:text-m3-on-primary" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </div>
              </button>

              {/* 3. Bottom Right Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2.5">
                {isMockMode && (
                  <button
                    onClick={() => setShowLoginModal(true)}
                    className="px-4 py-2.5 rounded-full bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface text-xs font-bold font-display m3-pressable shadow-xs transition-colors"
                  >
                    {t('quickLogin')}
                  </button>
                )}

                <button
                  onClick={() => {
                    logout();
                    setActiveScreen('login');
                  }}
                  className="px-4 py-2.5 rounded-full bg-m3-error-container/30 text-m3-error hover:bg-m3-error hover:text-m3-on-error text-xs font-bold font-display m3-pressable shadow-xs flex items-center gap-1.5 transition-colors"
                  title={t('logout')}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t('logout')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Subscreen 2: Vzhled a téma */}
          {subScreen === 'appearance' && (
            <div className="flex flex-col gap-1.5">
              {/* Item 1: Režim zobrazení */}
              <button
                onClick={() => setShowThemeDrawer(true)}
                className={`w-full p-4 sm:p-5 ${groupRadius(0, appearanceRows)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex items-center justify-between gap-4 text-left m3-pressable shadow-xs group`}
              >
                <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                    <ThemeIcon className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight truncate">
                      {currentThemeInfo.title}
                    </span>
                  </div>
                </div>

                <div className="w-9 h-9 rounded-full flex items-center justify-center text-m3-on-surface-variant/70 group-hover:text-m3-primary group-hover:translate-x-0.5 transition-all shrink-0">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </button>

              {/* Item 2: Barevný akcent */}
              <button
                onClick={() => setShowAccentDrawer(true)}
                className={`w-full p-4 sm:p-5 ${groupRadius(1, appearanceRows)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex items-center justify-between gap-4 text-left m3-pressable shadow-xs group`}
              >
                <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                    <AccentIcon className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight truncate">
                      {currentAccentInfo.title}
                    </span>
                  </div>
                </div>

                <div className="w-9 h-9 rounded-full flex items-center justify-center text-m3-on-surface-variant/70 group-hover:text-m3-primary group-hover:translate-x-0.5 transition-all shrink-0">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </button>

              {appIcon.icon && (
                <AppIconRow icon={appIcon.icon} index={2} count={appearanceRows} onOpen={() => setShowIconDrawer(true)} />
              )}
            </div>
          )}

          {/* Subscreen 3: Přizpůsobení */}
          {subScreen === 'customization' && (
            <div className="flex flex-col gap-6">
              {/* Home Screen Widget Manager */}
              <div className="flex flex-col gap-3">
                <div className="px-1">
                  <h3 className="text-sm font-bold font-display text-m3-on-surface">
                    {t('homeCustomization')}
                  </h3>
                  <p className="text-xs text-m3-on-surface-variant mt-0.5">
                    {t('homeCustomizationDesc')}
                  </p>
                </div>

                <div ref={widgetListRef} className="flex flex-col gap-1.5">
                  {widgetOrder.map((key, index) => (
                    <ReorderableWidgetItem
                      key={key}
                      widgetKey={key}
                      index={index}
                      isEnabled={widgets[key]}
                      isDragging={activeDragIndex === index}
                      count={widgetOrder.length}
                      onToggle={() => toggleWidget(key)}
                      onHandlePointerDown={handleHandlePointerDown}
                    />
                  ))}
                </div>
              </div>

              {/* Dedicated Countdown Widget Configuration Section */}
              {widgets.countdown && (
                <>
                  {/* Wavy Divider between widgets and countdown settings */}
                  <div className="py-2 px-1">
                    <MaterialWavyDivider />
                  </div>

                  {/* Countdown Settings Section */}
                  <div className="flex flex-col gap-3">
                    <div className="px-1">
                      <h3 className="text-sm font-bold font-display text-m3-on-surface">
                        {t('countdownTitle')}
                      </h3>
                      <p className="text-xs text-m3-on-surface-variant mt-0.5">
                        {t('countdownDesc')}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {[
                        {
                          id: 'lesson_time' as const,
                          title: t('lessonCountdown'),
                          icon: Timer,
                          preview: '14:28',
                        },
                        {
                          id: 'day_time' as const,
                          title: t('dayCountdown'),
                          icon: Clock,
                          preview: '04:15:30',
                        },
                        {
                          id: 'lesson_percent' as const,
                          title: t('lessonProgress'),
                          icon: Percent,
                          preview: countdownHideDecimals ? '68 %' : '68.25 %',
                        },
                        {
                          id: 'day_percent' as const,
                          title: t('dayProgress'),
                          icon: Calendar,
                          preview: countdownHideDecimals ? '42 %' : '42.10 %',
                        },
                      ].map((opt, optIndex) => {
                        const isSel = countdownMode === opt.id;
                        const Icon = opt.icon;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setCountdownMode(opt.id)}
                            className={`p-4 sm:p-5 ${groupRadius(optIndex, 5)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex items-center justify-between gap-3 sm:gap-4 shadow-xs select-none relative text-left m3-pressable`}
                          >
                            <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                              {/* Round backdrop icon */}
                              <div
                                className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-transform shadow-2xs ${
                                  isSel
                                    ? 'bg-m3-primary text-m3-on-primary'
                                    : 'bg-m3-primary-container text-m3-on-primary-container'
                                }`}
                              >
                                <Icon className="w-6 h-6" />
                              </div>

                              {/* Label */}
                              <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight truncate">
                                {opt.title}
                              </span>
                            </div>

                            {/* Right side: Preview pill + Radio / Check indicator */}
                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="px-2.5 py-1 rounded-lg bg-m3-surface-container-highest/60 text-m3-primary font-mono font-bold text-xs tabular-nums hidden sm:inline-block">
                                {opt.preview}
                              </span>
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                                  isSel
                                    ? 'bg-m3-primary text-m3-on-primary shadow-2xs'
                                    : 'border-2 border-m3-outline-variant/60 bg-transparent'
                                }`}
                              >
                                {isSel && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                            </div>
                          </button>
                        );
                      })}

                      {/* Card 5: Toggle setin procent */}
                      <div
                        onClick={() => setCountdownHideDecimals(!countdownHideDecimals)}
                        className={`p-4 sm:p-5 ${groupRadius(4, 5)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex items-center justify-between gap-3 sm:gap-4 shadow-xs select-none cursor-pointer m3-pressable`}
                      >
                        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                          <div className="w-12 h-12 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shrink-0 shadow-2xs">
                            <Hash className="w-6 h-6" />
                          </div>

                          <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight truncate">
                            {t('hideDecimalsTitle')}
                          </span>
                        </div>

                        {/* Right control: Toggle Switch */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCountdownHideDecimals(!countdownHideDecimals);
                          }}
                          className={`w-12 h-7 rounded-full transition-colors flex items-center p-1 shrink-0 ${
                            countdownHideDecimals
                              ? 'bg-m3-primary justify-end'
                              : 'bg-m3-surface-container-highest justify-start'
                          }`}
                          title={countdownHideDecimals ? t('decimalsHidden') : t('decimalsShown')}
                        >
                          <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Wavy Divider between home customization and bottom nav */}
              <div className="py-2 px-1">
                <MaterialWavyDivider />
              </div>

              {/* Bottom Nav Bar Customization */}
              <div className="flex flex-col gap-3">
                <div className="px-1">
                  <h3 className="text-sm font-bold font-display text-m3-on-surface">
                    {t('bottomNavCustomization')}
                  </h3>
                  <p className="text-xs text-m3-on-surface-variant mt-0.5">
                    {t('bottomNavCustomizationDesc')}
                  </p>
                </div>

                {/* Horizontal draggable and tappable navbar row */}
                <div
                  ref={navRowRef}
                  className="p-1.5 sm:p-2.5 rounded-m3-2xl sm:rounded-m3-3xl bg-m3-surface-container flex items-center justify-between gap-0.5 sm:gap-1.5 shadow-xs select-none touch-pan-y relative w-full max-w-full overflow-hidden"
                  style={{ touchAction: 'pan-y' }}
                >
                  {bottomNavOrder.map((key, index) => {
                    const isEnabled = bottomNavEnabled[key];
                    const isDragging = activeDragNavIndex === index;
                    const config = BOTTOM_NAV_CONFIG[key];
                    const Icon = config.icon;
                    const label = t(config.labelKey);

                    return (
                      <div
                        key={key}
                        onPointerDown={(e) => handleNavPointerDown(index, key, e)}
                        className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 sm:px-1 rounded-xl sm:rounded-2xl cursor-grab active:cursor-grabbing select-none touch-pan-y flex-1 min-w-0 max-w-full transition-colors duration-150 ${
                          isDragging
                            ? 'scale-105 shadow-lg z-30 bg-m3-primary text-m3-on-primary'
                            : isEnabled
                            ? 'bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface'
                            : 'bg-m3-surface-container/30 text-m3-on-surface-variant/40 opacity-40 hover:opacity-60'
                        }`}
                        style={{ touchAction: 'pan-y' }}
                        title={`${label} (${isEnabled ? t('active') : t('disabled')})`}
                      >

                        {/* Icon inside Pill */}
                        <div
                          className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                            isDragging
                              ? 'bg-white/20 text-white'
                              : isEnabled
                              ? 'bg-m3-primary-container text-m3-on-primary-container shadow-2xs'
                              : 'bg-m3-surface-container-highest/40 text-m3-on-surface-variant/40'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
                        </div>

                        {/* Label */}
                        <span
                          className={`text-[8px] sm:text-[9.5px] font-display font-bold mt-1 tracking-tight text-center truncate w-full leading-tight ${
                            isDragging
                              ? 'text-white'
                              : isEnabled
                              ? 'text-m3-on-surface'
                              : 'text-m3-on-surface-variant/40'
                          }`}
                        >
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Subscreen 4: O aplikaci */}
          {subScreen === 'about' && (
            <div className="flex flex-col gap-5">
              <div className="px-1">
                <div className="flex items-center gap-3">
                  <AppLogo className="h-12 w-12" />
                  <h3 className="text-base font-black font-display text-m3-on-surface">
                    {APP_NAME}
                  </h3>
                </div>
                <p className="text-xs text-m3-on-surface-variant leading-relaxed mt-1">
                  {t('appDescription')}
                </p>
              </div>

              {canInstall && !isNativePlatform() && (
                <button
                  type="button"
                  onClick={installPwa}
                  className="p-3.5 sm:p-4 rounded-m3-2xl bg-m3-primary text-m3-on-primary flex items-center justify-between gap-3 text-left transition-all shadow-xs m3-pressable"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <Download className="w-5 h-5 text-m3-on-primary" />
                    </div>
                    <div className="flex flex-col">
                      <strong className="font-display font-extrabold text-sm">{t('installApp')}</strong>
                      <span className="text-[11px] opacity-90 leading-tight">{t('installAppDesc')}</span>
                    </div>
                  </div>
                </button>
              )}

              {isInstalled && !isNativePlatform() && (
                <div className="p-3.5 sm:p-4 rounded-m3-2xl bg-m3-surface-container-high flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <strong className="font-display font-extrabold text-sm text-m3-on-surface">{t('installedApp')}</strong>
                    <span className="text-[11px] text-m3-on-surface-variant leading-tight">PWA / Standalone</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5 text-xs">
                <div className={`p-3.5 sm:p-4 ${groupRadius(0, 2)} bg-m3-surface-container-high flex flex-col gap-1`}>
                  <span className="text-m3-on-surface-variant text-[11px] font-medium">{t('clientVersion')}</span>
                  <strong className="text-m3-on-surface font-display text-sm">{__APP_VERSION__}</strong>
                </div>

                <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className={`p-3.5 sm:p-4 ${groupRadius(1, 2)} bg-m3-surface-container-high hover:bg-m3-surface-container-highest transition-colors flex items-center gap-3`}>
                  <div className="w-10 h-10 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <strong className="font-display font-extrabold text-sm text-m3-on-surface">{t('privacyPolicy')}</strong>
                    <span className="text-[11px] text-m3-on-surface-variant leading-tight">{t('privacyPolicyDesc')}</span>
                  </div>
                  <ExternalLink className="w-4 h-4 ml-auto shrink-0 text-m3-on-surface-variant" aria-hidden="true" />
                </a>
              </div>

              <TestNotice className="bg-m3-surface-container-high" />
            </div>
          )}

          {/* Subscreen 5: Jazyk */}
          {subScreen === 'language' && (
            <div className="flex flex-col gap-1.5">
              {[
                { id: 'cs' as const, label: 'Čeština', flag: '🇨🇿' },
                { id: 'en' as const, label: 'English', flag: '🇬🇧' },
              ].map((lang, langIndex) => {
                const isSelected = language === lang.id;
                return (
                  <button
                    key={lang.id}
                    onClick={() => setLanguage(lang.id)}
                    className={`w-full p-4 sm:p-5 ${groupRadius(langIndex, 2)} flex items-center justify-between gap-4 text-left transition-all m3-pressable shadow-xs group ${
                      isSelected
                        ? 'bg-m3-primary-container text-m3-on-primary-container'
                        : 'bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-2xs text-2xl ${
                          isSelected
                            ? 'bg-m3-primary text-m3-on-primary'
                            : 'bg-m3-primary-container text-m3-on-primary-container'
                        }`}
                      >
                        <span>{lang.flag}</span>
                      </div>
                      <span className="font-extrabold font-display text-base leading-tight truncate">
                        {lang.label}
                      </span>
                    </div>

                    {isSelected && (
                      <Check className="w-5 h-5 text-m3-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* School Search & Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in"
            onClick={() => setShowLoginModal(false)}
          />

          <div className="relative w-full max-w-md p-6 rounded-m3-3xl bg-m3-surface-container text-m3-on-surface shadow-2xl z-10 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black font-display text-m3-on-surface">
                {t('loginModalTitle')}
              </h3>
              <button
                onClick={() => setShowLoginModal(false)}
                className="w-8 h-8 rounded-full bg-m3-surface-container-high flex items-center justify-center text-m3-on-surface-variant hover:text-m3-on-surface m3-pressable"
                aria-label={t('close')}
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-m3-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handlePerformLogin} className="flex flex-col gap-3.5">
              {/* School Search or Manual URL */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-m3-on-surface-variant font-display">
                  {t('step1School')}
                </label>
                
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={searchCity}
                    onChange={(e) => setSearchCity(e.target.value)}
                    placeholder={t('citySearchPlaceholder')}
                    className="flex-1 px-3 py-2 rounded-m3-xl bg-m3-surface-container-high text-m3-on-surface text-xs focus:outline-none focus:ring-2 focus:ring-m3-primary/50"
                  />
                  <button
                    type="button"
                    onClick={handleSearchCities}
                    className="px-3 py-2 rounded-m3-xl bg-m3-secondary text-m3-on-secondary text-xs font-bold font-display flex items-center gap-1 m3-pressable"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{t('search')}</span>
                  </button>
                </div>

                {/* City Results Dropdown */}
                {cityResults.length > 0 && (
                  <div className="max-h-28 overflow-y-auto p-1.5 rounded-m3-xl bg-m3-surface-container-highest flex flex-col gap-1">
                    {cityResults.slice(0, 6).map((city) => (
                      <button
                        key={city.name}
                        type="button"
                        onClick={() => handleSelectCity(city.name)}
                        className="p-1.5 text-left text-xs font-semibold rounded-m3-md hover:bg-m3-primary/20 text-m3-on-surface truncate"
                      >
                        📍 {city.name} ({t('schoolsCount', { count: city.schoolCount })})
                      </button>
                    ))}
                  </div>
                )}

                {/* Schools list in city */}
                {schoolResults.length > 0 && (
                  <div className="max-h-32 overflow-y-auto p-1.5 rounded-m3-xl bg-m3-surface-container-highest flex flex-col gap-1">
                    {schoolResults.map((sch) => (
                      <button
                        key={sch.id}
                        type="button"
                        onClick={() => {
                          setSelectedSchool(sch);
                          setSchoolUrlInput(sch.schoolUrl);
                          setSchoolResults([]);
                        }}
                        className="p-2 text-left text-xs rounded-m3-md hover:bg-m3-primary/20 text-m3-on-surface truncate"
                      >
                        <strong className="block font-display truncate">{sch.name}</strong>
                        <span className="text-[10px] text-m3-primary truncate font-mono">{sch.schoolUrl}</span>
                      </button>
                    ))}
                  </div>
                )}

                <input
                  type="text"
                  value={selectedSchool ? selectedSchool.schoolUrl : schoolUrlInput}
                  onChange={(e) => {
                    setSelectedSchool(null);
                    setSchoolUrlInput(e.target.value);
                  }}
                  placeholder="https://skola.bakalari.cz"
                  required
                  className="w-full px-3 py-2 rounded-m3-xl bg-m3-surface-container-high text-m3-on-surface text-xs mt-1 font-mono focus:outline-none focus:ring-2 focus:ring-m3-primary/50"
                />
              </div>

              {/* Username */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-m3-on-surface-variant font-display">
                  {t('step2Username')}
                </label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder={t('usernamePlaceholder')}
                  required
                  className="w-full px-3 py-2 rounded-m3-xl bg-m3-surface-container-high text-m3-on-surface text-xs focus:outline-none focus:ring-2 focus:ring-m3-primary/50"
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-m3-on-surface-variant font-display">
                  {t('step3Password')}
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2 rounded-m3-xl bg-m3-surface-container-high text-m3-on-surface text-xs focus:outline-none focus:ring-2 focus:ring-m3-primary/50"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-bold font-display text-xs flex items-center justify-center gap-1.5 shadow-sm m3-pressable"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{isLoading ? t('loading') : t('login')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="px-4 py-2.5 rounded-full bg-m3-surface-container-high text-m3-on-surface font-bold font-display text-xs m3-pressable"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Drawer: Režim zobrazení */}
      {showThemeDrawer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setShowThemeDrawer(false)}
          />

          {/* Bottom Sheet Container */}
          <div className="relative w-full max-w-lg bg-m3-surface-container-low text-m3-on-surface rounded-t-m3-3xl shadow-2xl px-7 sm:px-8 py-5 sm:py-6 sheet-safe-bottom flex flex-col gap-4 z-10 animate-in slide-in-from-bottom duration-250">
            {/* Drag handle */}
            <div className="w-10 h-1.5 rounded-full bg-m3-outline-variant/60 mx-auto -mt-1 mb-1" />

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black font-display text-m3-on-surface">
                {t('themeMode')}
              </h3>
              <button
                onClick={() => setShowThemeDrawer(false)}
                className="w-8 h-8 rounded-full bg-m3-surface-container-high flex items-center justify-center text-m3-on-surface-variant hover:text-m3-on-surface m3-pressable"
                aria-label={t('close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              {themeChoices.map((tc, tcIndex) => {
                const Icon = tc.icon;
                const isSelected = currentThemeChoice === tc.id;
                return (
                  <button
                    key={tc.id}
                    onClick={() => handleSelectThemeChoice(tc.id)}
                    className={`w-full p-3.5 sm:p-4 ${groupRadius(tcIndex, themeChoices.length)} flex items-center justify-between gap-3 text-left transition-all m3-pressable ${
                      isSelected
                        ? 'bg-m3-primary-container text-m3-on-primary-container shadow-xs'
                        : 'bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                          : 'bg-m3-surface-container-high text-m3-on-surface'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="font-extrabold font-display text-sm leading-tight truncate">
                        {tc.title}
                      </span>
                    </div>

                    {isSelected && (
                      <Check className="w-5 h-5 text-m3-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showIconDrawer && appIcon.icon && (
        <AppIconDrawer icon={appIcon.icon} onChoose={appIcon.choose} onClose={() => setShowIconDrawer(false)} />
      )}

      {/* Bottom Drawer: Barevný akcent */}
      {showAccentDrawer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setShowAccentDrawer(false)}
          />

          {/* Bottom Sheet Container */}
          <div className="relative w-full max-w-lg bg-m3-surface-container-low text-m3-on-surface rounded-t-m3-3xl shadow-2xl px-7 sm:px-8 py-5 sm:py-6 sheet-safe-bottom flex flex-col gap-4 z-10 animate-in slide-in-from-bottom duration-250">
            {/* Drag handle */}
            <div className="w-10 h-1.5 rounded-full bg-m3-outline-variant/60 mx-auto -mt-1 mb-1" />

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black font-display text-m3-on-surface">
                {t('accentColor')}
              </h3>
              <button
                onClick={() => setShowAccentDrawer(false)}
                className="w-8 h-8 rounded-full bg-m3-surface-container-high flex items-center justify-center text-m3-on-surface-variant hover:text-m3-on-surface m3-pressable"
                aria-label={t('close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              {accents.map((acc, accIndex) => {
                const AccIcon = acc.icon;
                const isSelected = accentColor === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => {
                      setAccentColor(acc.id);
                      setShowAccentDrawer(false);
                    }}
                    className={`w-full p-3.5 sm:p-4 ${groupRadius(accIndex, accents.length)} flex items-center justify-between gap-3 text-left transition-all m3-pressable ${
                      isSelected
                        ? 'bg-m3-primary-container text-m3-on-primary-container shadow-xs'
                        : 'bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-xs"
                        style={{
                          backgroundColor: acc.colorHex,
                          color: '#1a1a1a',
                        }}
                      >
                        <AccIcon className="w-5 h-5" />
                      </div>
                      <span className="font-extrabold font-display text-sm leading-tight truncate">
                        {acc.title}
                      </span>
                    </div>

                    {isSelected && (
                      <Check className="w-5 h-5 text-m3-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
