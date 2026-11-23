import React, { useEffect, useState } from 'react';
import { formatDataAge } from '../../domain/dataAge';
import { useBackDismiss } from '../../native/backDismiss';
import { Menu, RefreshCw, LogIn, UserX, X } from 'lucide-react';
import { MaterialMorphingLoader } from '../common/MaterialMorphingLoader';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore, getSavedStudentName } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { useConnectionStatus } from '../../stores/connectionStore';
import { CONNECTION_LABEL_KEYS } from '../../domain/connectionStatus';
import { bakalariApi, normalizeSchoolUrl } from '../../api/client';
import { prepareLoginForSchool, schoolForReLogin } from '../../utils/loginDraft';
import { formatCzechDate } from '../../utils/dateUtils';

export const TopAppBar: React.FC = () => {
  const { setDrawerOpen, setActiveScreen, t } = useSettingsStore();
  const { user, isMockMode, currentSchool, logout } = useAuthStore();
  const { isRefreshing, fetchAllData, lastUpdated } = useDataStore();
  const status = useConnectionStatus();
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  useBackDismiss(showStatusDialog, () => setShowStatusDialog(false));

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);
  const dataAge = isMockMode ? '' : formatDataAge(lastUpdated, now);

  const signInAgain = () => {
    // The school is read before the sign-out, which forgets it.
    const school = schoolForReLogin(currentSchool, bakalariApi.getTokens()?.schoolUrl, normalizeSchoolUrl);
    logout();
    if (school) prepareLoginForSchool(school);
    setShowStatusDialog(false);
    setActiveScreen('login');
  };

  const isClassLike = (val?: string | null) => Boolean(val && /^\d\.[A-Za-z]/i.test(val.trim()));
  const isInvalidClass = (val?: string | null) => !val || val === 'Třída' || val.trim() === '';

  let displayName = user?.name?.trim() || getSavedStudentName();
  let displayClass = user?.className?.trim() || '';

  if (isClassLike(displayName)) {
    if (isInvalidClass(displayClass)) {
      displayClass = displayName;
    }
    displayName = '';
  }

  if (isInvalidClass(displayClass)) {
    displayClass = '';
  }

  const finalDisplayName = displayName || (isMockMode ? 'Demo Student' : 'Student');

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-m3-surface/90 backdrop-blur-xl transition-colors safe-top">
        {/* The name gets the width it needs first; the side columns share the rest equally, so it stays centred
            until a side needs more than its half. A fixed minimum on the sides left a phone only ~120px. */}
        <div className="max-w-5xl mx-auto px-4 h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {/* Left: 3-Line Hamburger Menu Button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="justify-self-start w-11 h-11 flex items-center justify-center rounded-full bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface m3-pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-m3-primary/50"
            aria-label={t('menu')}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Center: Student Name & School Clickable Pill */}
          <button
            onClick={() => {
              if (isMockMode) {
                setActiveScreen('login');
              } else {
                setActiveScreen('settings');
              }
            }}
            className="flex flex-col items-center justify-center text-center truncate min-w-0 sm:max-w-md px-3 py-1 rounded-full hover:bg-m3-surface-container-high/50 transition-colors m3-pressable"
            title={isMockMode ? t('loginRealSchoolPrompt') : t('showAccountSettings')}
          >
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-sm sm:text-base font-extrabold font-display text-m3-on-surface truncate">
                {finalDisplayName}
              </span>
              {displayClass ? (
                <span className="shrink-0 text-[10px] sm:text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-m3-primary-container text-m3-on-primary-container font-display">
                  {displayClass}
                </span>
              ) : null}
            </div>
          </button>

          {/* Right: Quick Login Button in Demo mode + Status/Refresh Button */}
          <div className="justify-self-end flex items-center gap-1.5">
            {isMockMode && (
              <button
                onClick={() => setActiveScreen('login')}
                className="h-11 px-3 flex items-center justify-center rounded-full bg-m3-primary-container text-m3-on-primary-container text-xs font-bold font-display hover:bg-m3-primary hover:text-m3-on-primary transition-all m3-pressable shadow-xs whitespace-nowrap"
              >
                {t('loginSchool')}
              </button>
            )}

            {isMockMode ? null : (
            <div className={dataAge ? 'flex items-center rounded-full bg-m3-surface-container' : 'contents'}>
            {dataAge && (
              <span
                className="pl-3.5 pr-1 text-xs font-bold font-display text-m3-on-surface-variant whitespace-nowrap"
                title={`${t('statusLastUpdate')}: ${formatCzechDate(new Date(lastUpdated), 'withTime')}`}
              >
                {dataAge}
              </span>
            )}
            {isRefreshing ? (
              <button
                disabled
                className="w-11 h-11 flex items-center justify-center rounded-full bg-m3-surface-container text-m3-primary transition-all cursor-default"
                title={t('refresh')}
                aria-label={t('refresh')}
              >
                <MaterialMorphingLoader size={20} className="h-5 w-5 text-m3-primary" />
              </button>
            ) : status === 'signedOut' ? (
              <button
                onClick={() => setShowStatusDialog(true)}
                className="h-11 px-3 flex items-center justify-center gap-1.5 rounded-full text-xs font-bold font-display m3-pressable transition-all whitespace-nowrap bg-m3-error-container text-m3-on-error-container hover:opacity-90"
                title={t('statusDetails')}
                aria-label={t('statusDetails')}
              >
                <UserX className="w-4 h-4" />
                <span>{t(CONNECTION_LABEL_KEYS.signedOut)}</span>
              </button>
            ) : status !== 'ok' ? (
              <button
                onClick={() => fetchAllData(false)}
                className="h-11 px-3 flex items-center justify-center rounded-full text-xs font-bold font-display m3-pressable transition-all whitespace-nowrap bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400"
                title={t('refresh')}
                aria-label={`${t(CONNECTION_LABEL_KEYS[status])}, ${t('refresh')}`}
              >
                {t(CONNECTION_LABEL_KEYS[status])}
              </button>
            ) : (
              <button
                onClick={() => fetchAllData(false)}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface-variant hover:text-m3-primary m3-pressable transition-all"
                title={t('refresh')}
                aria-label={t('refresh')}
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            )}
            </div>
            )}
          </div>
        </div>
      </header>

      {showStatusDialog && status === 'signedOut' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-m3-surface-container rounded-m3-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95" role="dialog" aria-modal="true">
            <div className="flex items-start justify-between gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-m3-error-container text-m3-on-error-container">
                <UserX className="w-7 h-7" />
              </div>
              <button
                onClick={() => setShowStatusDialog(false)}
                className="p-1 rounded-full text-m3-on-surface-variant hover:bg-m3-surface-container-high transition-colors"
                aria-label={t('close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-bold font-display text-m3-on-surface">{t('statusSignedOutTitle')}</h3>
              <p className="text-sm text-m3-on-surface-variant leading-relaxed">{t('statusSignedOutBody')}</p>
              {lastUpdated > 0 && (
                <div className="mt-1 px-3 py-2 rounded-xl bg-m3-surface-container-high/60 text-xs text-m3-on-surface-variant font-medium flex items-center justify-between gap-3">
                  <span>{t('statusLastUpdate')}</span>
                  <span className="font-bold text-m3-on-surface">{formatCzechDate(new Date(lastUpdated), 'withTime')}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowStatusDialog(false)}
                className="px-4 py-2.5 rounded-full text-xs font-bold font-display text-m3-on-surface-variant hover:bg-m3-surface-container-high transition-colors m3-pressable"
              >
                {t('statusUnderstood')}
              </button>
              <button
                type="button"
                onClick={signInAgain}
                className="px-5 py-2.5 rounded-full text-xs font-bold font-display bg-m3-primary text-m3-on-primary hover:opacity-90 transition-opacity m3-pressable shadow-xs flex items-center gap-1.5"
              >
                <LogIn className="w-4 h-4" />
                <span>{t('statusSignInAgain')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

