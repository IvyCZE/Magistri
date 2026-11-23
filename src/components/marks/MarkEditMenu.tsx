import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Mark } from '../../types/bakalari';
import { applyOverride, type MarkOverride } from '../../domain/markSimulation';
import { useSettingsStore } from '../../stores/settingsStore';
import { useBackDismiss } from '../../native/backDismiss';

interface MarkEditMenuProps {
  mark: Mark;
  override?: MarkOverride;
  /** Bounds of the element the menu opens from. */
  anchor: DOMRect;
  /** Called only when the user presses Save; null means the draft equals the recorded mark. */
  onSave: (override: MarkOverride | null) => void;
  onDelete: () => void;
  onClose: () => void;
}

const MENU_WIDTH = 288;
const EDGE = 12;

/** Override that holds only what really differs from the recorded mark, or null when nothing does. */
const buildOverride = (mark: Mark, markText: string, weight: number): MarkOverride | null => {
  const next: MarkOverride = {};
  if (markText !== mark.markText) next.markText = markText;
  if (weight !== mark.weight) next.weight = weight;
  return Object.keys(next).length > 0 ? next : null;
};

export const MarkEditMenu: React.FC<MarkEditMenuProps> = ({ mark, override, anchor, onSave, onDelete, onClose }) => {
  const { t } = useSettingsStore();
  useBackDismiss(true, onClose);

  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const height = menuRef.current?.offsetHeight ?? 0;
    const left = Math.min(
      Math.max(EDGE, anchor.right - MENU_WIDTH),
      Math.max(EDGE, window.innerWidth - MENU_WIDTH - EDGE)
    );
    const below = anchor.bottom + 8;
    const fitsBelow = below + height + EDGE <= window.innerHeight;
    const top = fitsBelow ? below : Math.max(EDGE, anchor.top - 8 - height);
    setPosition({ top, left });
  }, [anchor]);

  // The menu is fixed to the screen, so wheel-scrolling the page would leave it detached from its mark.
  useEffect(() => {
    window.addEventListener('wheel', onClose, { passive: true });
    return () => window.removeEventListener('wheel', onClose);
  }, [onClose]);

  // Edits stay in this draft until the user presses Save.
  const [draft, setDraft] = useState(() => {
    const start = applyOverride(mark, override);
    return { markText: start.markText, weight: start.weight || 1 };
  });
  const firstChar = draft.markText.trim().charAt(0);
  const grade = /^[1-5]$/.test(firstChar) ? Number(firstChar) : null;
  const minus = draft.markText.trim().endsWith('-');
  const maxWeight = Math.max(10, mark.weight || 0, draft.weight);
  const weight = draft.weight;

  const update = (markText: string, nextWeight: number) => setDraft({ markText, weight: nextWeight });

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          width: MENU_WIDTH,
          visibility: position ? 'visible' : 'hidden',
        }}
        className="fixed max-w-[calc(100vw-1.5rem)] p-4 rounded-m3-2xl bg-m3-surface-container-high text-m3-on-surface shadow-2xl flex flex-col gap-3.5"
      >
        <span className="text-sm font-extrabold font-display truncate">
          {mark.caption || mark.theme || t('noTestDescription')}
        </span>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-m3-on-surface-variant font-display">{t('markValue')}</span>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => update(`${g}${minus ? '-' : ''}`, weight)}
                className={`flex-1 py-2 rounded-m3-lg font-black font-display text-sm transition-all m3-pressable ${
                  grade === g
                    ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                    : 'bg-m3-surface-container text-m3-on-surface hover:bg-m3-surface-container-highest'
                }`}
              >
                {g}
              </button>
            ))}
            <button
              type="button"
              disabled={grade === null}
              onClick={() => grade !== null && update(`${grade}${minus ? '' : '-'}`, weight)}
              aria-pressed={minus}
              className={`w-10 py-2 rounded-m3-lg font-black font-display text-sm transition-all m3-pressable disabled:opacity-40 ${
                minus
                  ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                  : 'bg-m3-surface-container text-m3-on-surface hover:bg-m3-surface-container-highest'
              }`}
            >
              −
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-m3-on-surface-variant font-display">{t('markWeight')}:</span>
            <span className="text-xs font-black font-display px-2 py-0.5 rounded-full bg-m3-primary-container text-m3-on-primary-container shadow-xs">
              {weight}
            </span>
          </div>
          <div className="flex items-center gap-2.5 py-1">
            <span className="text-[11px] font-bold text-m3-on-surface-variant/70 font-display">1</span>
            <input
              type="range"
              min="1"
              max={maxWeight}
              step="1"
              value={Math.min(weight, maxWeight)}
              onChange={(e) => update(draft.markText, parseInt(e.target.value, 10))}
              style={{
                background: `linear-gradient(to right, var(--m3-primary) ${((weight - 1) / (maxWeight - 1)) * 100}%, var(--m3-surface-container-highest) ${((weight - 1) / (maxWeight - 1)) * 100}%)`,
              }}
              className="m3-slider flex-1"
            />
            <span className="text-[11px] font-bold text-m3-on-surface-variant/70 font-display">{maxWeight}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onDelete}
            className="px-3.5 py-2 rounded-full bg-m3-error-container/40 text-m3-error font-bold text-xs font-display flex items-center gap-1.5 m3-pressable"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('deleteMark')}</span>
          </button>
          <button
            type="button"
            onClick={() => onSave(buildOverride(mark, draft.markText, draft.weight))}
            className="ml-auto px-4 py-2 rounded-full bg-m3-primary text-m3-on-primary font-bold text-xs font-display shadow-xs m3-pressable"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
};
