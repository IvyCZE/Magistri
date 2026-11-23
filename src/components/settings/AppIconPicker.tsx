import React, { useEffect, useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { AppIconPreview } from '../common/AppLogo';
import { getNativeAppIcon, setNativeAppIcon, type AppIconId } from '../../native/bridge';
import { useSettingsStore } from '../../stores/settingsStore';
import { groupRadius } from '../../utils/groupRadius';
import type { TranslationKey } from '../../i18n/translations';

const OPTIONS: AppIconId[] = ['default', 'classic'];
const TITLE_KEYS: Record<AppIconId, TranslationKey> = { default: 'appIconDefault', classic: 'appIconClassic' };

/** The launcher icon in use (null outside the Android app) and a way to change it. */
export function useAppIcon() {
  const [icon, setIcon] = useState<AppIconId | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNativeAppIcon().then((current) => {
      if (!cancelled) setIcon(current);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (next: AppIconId) => {
    if (next !== icon && (await setNativeAppIcon(next))) setIcon(next);
  };

  return { icon, choose };
}

interface AppIconRowProps {
  icon: AppIconId;
  index: number;
  count: number;
  onOpen: () => void;
}

/** Row in Appearance & Theme, built like the display mode and accent rows. */
export const AppIconRow: React.FC<AppIconRowProps> = ({ icon, index, count, onOpen }) => {
  const { t } = useSettingsStore();
  return (
    <button
      onClick={onOpen}
      className={`w-full p-4 sm:p-5 ${groupRadius(index, count)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex items-center justify-between gap-4 text-left m3-pressable shadow-xs group`}
    >
      <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
        <AppIconPreview variant={icon} className="h-12 w-12 rounded-full shrink-0 group-hover:scale-105 transition-transform shadow-2xs" />
        <div className="flex flex-col min-w-0">
          <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight truncate">
            {t('appIcon')}: {t(TITLE_KEYS[icon])}
          </span>
        </div>
      </div>
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-m3-on-surface-variant/70 group-hover:text-m3-primary group-hover:translate-x-0.5 transition-all shrink-0">
        <ChevronRight className="w-5 h-5" />
      </div>
    </button>
  );
};

interface AppIconDrawerProps {
  icon: AppIconId;
  onChoose: (icon: AppIconId) => void;
  onClose: () => void;
}

/** Bottom sheet with the icon choices, same layout as the display mode and accent sheets. */
export const AppIconDrawer: React.FC<AppIconDrawerProps> = ({ icon, onChoose, onClose }) => {
  const { t } = useSettingsStore();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-m3-surface-container-low text-m3-on-surface rounded-t-m3-3xl shadow-2xl px-7 sm:px-8 py-5 sm:py-6 sheet-safe-bottom flex flex-col gap-4 z-10 animate-in slide-in-from-bottom duration-250">
        <div className="w-10 h-1.5 rounded-full bg-m3-outline-variant/60 mx-auto -mt-1 mb-1" />

        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black font-display text-m3-on-surface">{t('appIcon')}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-m3-surface-container-high flex items-center justify-center text-m3-on-surface-variant hover:text-m3-on-surface m3-pressable"
            aria-label={t('close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-m3-on-surface-variant -mt-2">{t('appIconDesc')}</p>

        <div className="flex flex-col gap-1.5 pt-1">
          {OPTIONS.map((option, index) => {
            const isSelected = option === icon;
            return (
              <button
                key={option}
                onClick={() => {
                  onChoose(option);
                  onClose();
                }}
                className={`w-full p-3.5 sm:p-4 ${groupRadius(index, OPTIONS.length)} flex items-center justify-between gap-3 text-left transition-all m3-pressable ${
                  isSelected
                    ? 'bg-m3-primary-container text-m3-on-primary-container shadow-xs'
                    : 'bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <AppIconPreview variant={option} className="h-10 w-10 rounded-full shrink-0" />
                  <span className="font-extrabold font-display text-sm leading-tight truncate">{t(TITLE_KEYS[option])}</span>
                </div>
                {isSelected && <Check className="w-5 h-5 text-m3-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
