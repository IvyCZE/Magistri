import React from 'react';
import { ExternalLink, MessageSquarePlus, X } from 'lucide-react';
import { FEEDBACK_FORM_URL } from '../../config/links';
import { useSettingsStore } from '../../stores/settingsStore';

interface TestNoticeProps {
  /** `drawer` is the small variant with a shorter text. */
  variant?: 'full' | 'drawer';
  /** Shows a close button when given. */
  onDismiss?: () => void;
  /** Background, shadow and positioning are up to the caller. */
  className?: string;
}

const FULL_TEXT =
  'Aplikace je v testovacím provozu, mohou tu být chyby. Pokud na nějakou narazíte, nebo máte návrh, prosím vyplňte tento formulář (klidně opakovaně). Děkuji!';
const DRAWER_TEXT = 'Aplikace je v testovacím provozu. Vyskytla se chyba nebo máte nápad?';

/** The "test version" card with the feedback form link. */
export const TestNotice: React.FC<TestNoticeProps> = ({ variant = 'full', onDismiss, className = '' }) => {
  const t = useSettingsStore((s) => s.t);
  const small = variant === 'drawer';

  return (
    <div
      className={`flex flex-col gap-2 text-m3-on-surface ${small ? 'rounded-[1.25rem] p-3' : 'rounded-[1.4rem] p-4'} ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-full bg-m3-tertiary-container font-black uppercase tracking-wider text-m3-on-tertiary-container ${
            small ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-0.5 text-[10px]'
          }`}
        >
          Testovací verze
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="m3-pressable -mr-1.5 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-m3-on-surface-variant hover:bg-m3-surface-container-high"
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className={`text-m3-on-surface-variant ${small ? 'text-[11px] leading-snug' : 'text-xs leading-relaxed'}`}>
        {small ? DRAWER_TEXT : FULL_TEXT}
      </p>
      <a
        href={FEEDBACK_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`m3-pressable inline-flex items-center justify-center rounded-full bg-m3-surface-container-highest font-bold text-m3-on-surface transition-colors hover:bg-m3-primary hover:text-m3-on-primary ${
          small ? 'gap-1.5 px-3 py-1.5 text-[11px]' : 'gap-2 px-4 py-2 text-xs'
        }`}
      >
        <MessageSquarePlus className={`${small ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-m3-primary`} />
        <span>Formulář</span>
        <ExternalLink className="h-3 w-3 opacity-60" />
      </a>
    </div>
  );
};
