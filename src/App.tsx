import React, { Suspense, useEffect, useState } from 'react';
import {
  X,
  ExternalLink,
  ShieldCheck,
  FileText,
  HelpCircle,
  Library,
} from 'lucide-react';
import { useSettingsStore } from './stores/settingsStore';
import { useAuthStore } from './stores/authStore';
import { useDataStore } from './stores/dataStore';
import { useNavigationMode } from './hooks/useNavigationMode';
import { useBackDismiss } from './native/backDismiss';
import { useKeyboardOpen } from './native/keyboard';
import { schoolModuleUrl, schoolWebUrl } from './utils/schoolWebUrl';

import { TopAppBar } from './components/layout/TopAppBar';
import { Drawer } from './components/layout/Drawer';
import { NavigationBar } from './components/layout/NavigationBar';
import { ErrorBoundary } from './components/common/ErrorBoundary';

import { HomePage } from './pages/HomePage';
import {
  MarksPage,
  TimetablePage,
  HomeworkPage,
  MessagesPage,
  EventsPage,
  AbsencePage,
  SubstitutionsPage,
  SubjectsPage,
  TeachingPage,
  SettingsPage,
  LoginPage,
  MessageDetailPage,
  NewMessagePage,
  preloadPages,
  isScreenLoaded,
  loadScreen,
} from './pages/lazyPages';

export const App: React.FC = () => {
  const { activeScreen, setActiveScreen, isDrawerOpen, t } = useSettingsStore();
  const { initAuth, isAuthenticated, isMockMode, currentSchool, user } = useAuthStore();
  const schoolWeb = schoolWebUrl(currentSchool?.schoolUrl, user?.schoolUrl);
  const navMode = useNavigationMode();
  const keyboardOpen = useKeyboardOpen();

  const [externalModal, setExternalModal] = useState<{
    id: string;
    title: string;
  } | null>(null);

  useBackDismiss(externalModal !== null, () => setExternalModal(null));

  useEffect(() => {
    preloadPages();
  }, []);

  // A screen that is not in memory yet would render as a blank gap while its code loads, so the
  // previous screen stays up until the new one is ready.
  const [readyScreen, setReadyScreen] = useState(activeScreen);
  useEffect(() => {
    let cancelled = false;
    void loadScreen(activeScreen).then(() => {
      if (!cancelled) setReadyScreen(activeScreen);
    });
    return () => {
      cancelled = true;
    };
  }, [activeScreen]);
  const shownScreen = isScreenLoaded(activeScreen) ? activeScreen : readyScreen;

  useEffect(() => {
    initAuth();

    // Check data freshness on mount
    const initialStore = useDataStore.getState();
    const elapsedOnMount = initialStore.lastUpdated ? Date.now() - initialStore.lastUpdated : Infinity;
    // If data is stale (> 45s) or never loaded, trigger fetch immediately
    initialStore.fetchAllData(elapsedOnMount < 120000);

    // Periodic background auto-check every 90 seconds while tab is open
    const interval = setInterval(() => {
      if (!document.hidden) {
        useDataStore.getState().fetchAllData(true);
      }
    }, 90000);

    // Auto-refresh when returning to the app window/tab after being away
    let wakeTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        if (wakeTimeout) clearTimeout(wakeTimeout);
        // Delay 350ms to allow mobile WiFi / cellular network sockets to reconnect after sleep
        wakeTimeout = setTimeout(() => {
          if (document.visibilityState !== 'visible') return;
          const currentStore = useDataStore.getState();
          const elapsed = currentStore.lastUpdated ? Date.now() - currentStore.lastUpdated : Infinity;
          // If data is older than 45 seconds, refresh automatically and show the spinning wheel!
          if (elapsed > 45000) {
            currentStore.fetchAllData(false);
          }
        }, 350);
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      if (wakeTimeout) clearTimeout(wakeTimeout);
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
    };
  }, [initAuth]);


  const isLoginScreen = shownScreen === 'login' || (!isAuthenticated && !isMockMode);

  const containerPadding = isLoginScreen
    ? 'h-screen overflow-hidden pb-0'
    : keyboardOpen
    ? 'pb-4'
    : navMode === 'rail-right'
    ? 'pb-8 sm:pb-10'
    : 'pb-28 sm:pb-32';

  const renderActiveScreen = () => {
    if (!isAuthenticated && !isMockMode) {
      return <LoginPage onSuccess={() => setActiveScreen('home')} />;
    }

    switch (shownScreen) {
      case 'home':
        return <HomePage />;
      case 'login':
        return <LoginPage onSuccess={() => setActiveScreen('home')} />;
      case 'marks':
        return <MarksPage />;
      case 'timetable':
        return <TimetablePage />;
      case 'homework':
        return <HomeworkPage />;
      case 'messages':
        return <MessagesPage />;
      case 'message-detail':
        return <MessageDetailPage />;
      case 'new-message':
        return <NewMessagePage />;
      case 'events':
        return <EventsPage />;
      case 'absence':
        return <AbsencePage />;
      case 'substitutions':
        return <SubstitutionsPage />;
      case 'subjects':
        return <SubjectsPage />;
      case 'teaching':
        return <TeachingPage />;
      case 'infochannel':
        return <MessagesPage initialTab="infochannel" />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className={`safe-x min-h-screen bg-m3-surface text-m3-on-surface flex flex-col font-sans antialiased selection:bg-m3-primary/20 ${containerPadding}`}>
      {/* 1. Persistent Top App Bar */}
      {!isLoginScreen && <TopAppBar />}

      {/* 2. Left Slide-out Drawer Menu */}
      {!isLoginScreen && (
        <Drawer
          onOpenExternalModal={(id, title) => {
            setExternalModal({ id, title });
          }}
        />
      )}

      {/* 3. Main Screen Body */}
      <main
        className={`flex-1 w-full flex flex-col animate-in fade-in duration-150 ${
          isLoginScreen ? 'min-h-0 overflow-hidden' : ''
        } ${isDrawerOpen ? 'pointer-events-none select-none' : ''}`}
        aria-hidden={isDrawerOpen}
      >
        <ErrorBoundary key={shownScreen}>
          <Suspense fallback={null}>{renderActiveScreen()}</Suspense>
        </ErrorBoundary>
      </main>

      {/* 4. Navigation Bar (Mobile bottom bar, tablet portrait floating dock, or landscape right rail) */}
      {!isLoginScreen && <NavigationBar />}

      {/* 5. External Link / Info Modal */}
      {externalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in"
            onClick={() => setExternalModal(null)}
          />

          <div className="relative w-full max-w-md p-6 rounded-m3-3xl bg-m3-surface-container text-m3-on-surface shadow-2xl z-10 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {externalModal.id === 'gdpr' && <ShieldCheck className="w-5 h-5 text-m3-primary" />}
                {externalModal.id === 'documents' && <FileText className="w-5 h-5 text-m3-primary" />}
                {externalModal.id === 'questionnaires' && <HelpCircle className="w-5 h-5 text-m3-primary" />}
                {externalModal.id === 'eduResources' && <Library className="w-5 h-5 text-m3-primary" />}
                <h3 className="text-lg font-black font-display text-m3-on-surface">
                  {externalModal.title}
                </h3>
              </div>
              <button
                onClick={() => setExternalModal(null)}
                className="w-8 h-8 rounded-full bg-m3-surface-container-high flex items-center justify-center text-m3-on-surface-variant hover:text-m3-on-surface m3-pressable"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-m3-on-surface-variant leading-relaxed">
              {t('externalModuleNote', { title: externalModal.title })}
            </p>

            <div className="flex items-center gap-2 pt-2">
              {schoolWeb && (
                <a
                  href={schoolModuleUrl(schoolWeb, externalModal.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-bold font-display text-xs flex items-center justify-center gap-1.5 shadow-sm m3-pressable"
                >
                  <span>{t('openOnSchoolWeb')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              <button
                onClick={() => setExternalModal(null)}
                className="px-4 py-2.5 rounded-full bg-m3-surface-container-high text-m3-on-surface font-bold font-display text-xs m3-pressable"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
