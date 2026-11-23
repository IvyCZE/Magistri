import React from 'react';
import { ChevronRight, ArrowRight, Award } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { GradeBadge } from '../common/GradeBadge';
import { formatCzechDate } from '../../utils/dateUtils';

export const RecentMarksWidget: React.FC = () => {
  const { getRecentMarks } = useDataStore();
  const { setActiveScreen, t } = useSettingsStore();

  const recentMarks = getRecentMarks(8);

  return (
    <div className="w-full flex flex-col gap-2.5">
      {/* Top Header Row */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base sm:text-lg font-bold font-display text-m3-on-surface flex items-center gap-2">
          {t('recentMarks')}
        </h3>
        <button
          onClick={() => setActiveScreen('marks')}
          className="text-xs font-bold text-m3-primary hover:underline flex items-center gap-1 font-display m3-pressable"
        >
          <span>{t('showAllMarks')}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {recentMarks.length === 0 ? (
        /* Empty state: no marks yet – show a clean placeholder + normal "Vše" button
           (the sticky gradient button looks broken with nothing to scroll under it) */
        <div className="p-3 sm:p-3.5 rounded-m3-2xl bg-m3-surface-container shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Award className="w-7 h-7 text-m3-on-surface-variant/40 shrink-0" />
            <span className="text-xs font-bold text-m3-on-surface font-display truncate">{t('noMarksYet')}</span>
          </div>
          <button
            onClick={() => setActiveScreen('marks')}
            className="w-12 sm:w-14 py-2.5 rounded-m3-2xl bg-m3-primary-container text-m3-on-primary-container flex flex-col items-center justify-center gap-1 m3-pressable hover:bg-m3-primary hover:text-m3-on-primary transition-all shrink-0"
            aria-label={t('showAllMarks')}
          >
            <ArrowRight className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] font-black font-display uppercase tracking-wider leading-none">{t('all')}</span>
          </button>
        </div>
      ) : (
      <div className="relative flex items-stretch gap-2.5 sm:gap-3 touch-scroll-x pb-2 pt-1 px-1 no-scrollbar -mx-1 sm:mx-0">
        {recentMarks.map((m) => (
          <div
            key={m.id}
            onClick={() => setActiveScreen('marks')}
            className="flex-shrink-0 w-44 sm:w-48 p-3.5 rounded-m3-2xl bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex flex-col justify-between m3-pressable cursor-pointer shadow-xs"
          >
            {/* Top row: Grade badge on left + Subject & Date/Weight next to it */}
            <div className="flex items-center gap-2.5 min-w-0">
              <GradeBadge
                mark={m.markText}
                showWeight={false}
                size="sm"
                className="w-8.5 h-8.5 text-base font-black rounded-full"
              />
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <span className="text-sm font-extrabold font-display text-m3-on-surface truncate leading-tight">
                  {m.subjectAbbrev}
                </span>
                <div className="flex items-center gap-1 text-[10px] text-m3-on-surface-variant font-medium leading-tight mt-0.5">
                  <span>{formatCzechDate(m.markDate, 'short')}</span>
                  {m.weight !== undefined && (
                    <>
                      <span>•</span>
                      <span className="font-bold text-m3-primary/90">
                        {t('weight')} {m.weight}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom: Caption / Description with tight teacher name below */}
            <div className="mt-2.5 flex flex-col gap-0.5 min-w-0">
              <p className="text-xs font-semibold text-m3-on-surface line-clamp-1 leading-snug">
                {m.caption || m.theme || t('noTestDescription')}
              </p>
              <span className="text-[10px] text-m3-on-surface-variant/80 truncate font-medium leading-none">
                {m.teacherName || m.subjectName}
              </span>
            </div>
          </div>
        ))}

        {/* Fixed / Sticky "All Marks" Button on the Right with Opaque Backdrop */}
        <div className="sticky -right-1 z-10 flex-shrink-0 flex items-stretch pl-4 sm:pl-6 pr-2 -mr-1 bg-gradient-to-r from-transparent via-m3-surface via-30% to-m3-surface">
          <button
            type="button"
            onClick={() => setActiveScreen('marks')}
            className="w-12 sm:w-14 rounded-m3-2xl bg-m3-primary-container text-m3-on-primary-container flex flex-col items-center justify-center text-center gap-1.5 m3-pressable cursor-pointer shadow-md hover:bg-m3-primary hover:text-m3-on-primary group transition-all"
            title={t('showAllMarks')}
            aria-label={t('showAllMarks')}
          >
            <div className="w-7 h-7 rounded-full bg-m3-primary/20 group-hover:bg-m3-on-primary/20 flex items-center justify-center transition-colors">
              <ArrowRight className="w-4 h-4 text-m3-primary group-hover:text-m3-on-primary transition-transform group-hover:translate-x-0.5" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-black font-display uppercase tracking-wider leading-none">
              {t('all')}
            </span>
          </button>
        </div>
      </div>
      )}
    </div>
  );
};
