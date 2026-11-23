import React, { useEffect, useRef, useState } from 'react';
import { Check, MoreVertical, Play } from 'lucide-react';
import { useBackDismiss } from '../../native/backDismiss';
import { useSettingsStore } from '../../stores/settingsStore';

const LANGUAGES = [
  { id: 'cs' as const, label: 'Čeština' },
  { id: 'en' as const, label: 'English' },
];

interface LoginOptionsMenuProps {
  onDemo: () => void;
}

/** A round button in the top right corner that opens a plain dropdown menu with the extra login options. */
export const LoginOptionsMenu: React.FC<LoginOptionsMenuProps> = ({ onDemo }) => {
  const { t, language, setLanguage } = useSettingsStore();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useBackDismiss(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={rootRef} className="login-safe-top-button absolute right-4 z-30 sm:right-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="m3-pressable flex h-12 w-12 items-center justify-center rounded-full bg-m3-surface text-m3-on-surface shadow-m3-1 backdrop-blur-xl"
        aria-label={t('loginMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-6 w-6" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 rounded-[1.25rem] bg-m3-surface py-2 text-m3-on-surface shadow-m3-2"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDemo();
            }}
            className="m3-pressable flex h-12 w-full items-center gap-3 px-4 text-left text-sm font-bold hover:bg-m3-surface-container"
          >
            <Play className="h-4 w-4 shrink-0 text-m3-primary" />
            <span className="truncate">{t('loginMenuDemo')}</span>
          </button>

          <div className="px-4 pb-1 pt-3 text-xs font-bold text-m3-on-surface-variant">{t('loginMenuLanguage')}</div>
          {LANGUAGES.map((lang) => {
            const selected = language === lang.id;
            return (
              <button
                key={lang.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setLanguage(lang.id);
                  setOpen(false);
                }}
                className="m3-pressable flex h-12 w-full items-center gap-3 px-4 text-left text-sm font-bold hover:bg-m3-surface-container"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {selected && <Check className="h-4 w-4 text-m3-primary" />}
                </span>
                <span>{lang.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
