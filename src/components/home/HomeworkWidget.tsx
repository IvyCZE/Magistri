import React from 'react';
import { ChevronRight, CheckCircle2, Circle, Clock, FileText, Plus, CheckSquare } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatCzechDate } from '../../utils/dateUtils';
import { homeworkStatus } from '../../domain/homework';
import { toIsoDate } from '../../domain/time';

export const HomeworkWidget: React.FC = () => {
  const { homeworks, toggleHomeworkDone } = useDataStore();
  const { setActiveScreen, t, language } = useSettingsStore();
  const today = toIsoDate(new Date());

  // Sort active homeworks by deadline ascending (shortest time left / nearest due date first)
  const activeHomeworks = React.useMemo(() => {
    return [...homeworks]
      .filter((h) => homeworkStatus(h, today) === 'active')
      .sort((a, b) => Number(!a.deadline) - Number(!b.deadline) || (a.deadline || '').localeCompare(b.deadline || ''));
  }, [homeworks, today]);

  const displayHomeworks = activeHomeworks.slice(0, 2);
  const remainingCount = activeHomeworks.length - 2;

  return (
    <div className="w-full flex flex-col gap-2.5 h-full">
      {/* Top Header Row */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base sm:text-lg font-bold font-display text-m3-on-surface flex items-center gap-2">
          {t('recentHomework')}
          {activeHomeworks.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-black rounded-full bg-m3-primary text-m3-on-primary font-display">
              {activeHomeworks.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => setActiveScreen('homework')}
          className="text-xs font-bold text-m3-primary hover:underline flex items-center gap-1 font-display m3-pressable"
        >
          <span>{t('showAllAssignments')}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Homework Column Container */}
      <div className="p-3 sm:p-4 rounded-m3-2xl bg-m3-surface-container flex flex-col gap-2.5 flex-1 justify-between">
        <div className="flex flex-col gap-2.5">
          {displayHomeworks.length === 0 ? (
            <div className="py-6 flex flex-col items-center justify-center text-center gap-2 text-m3-on-surface-variant">
              <CheckCircle2 className="w-8 h-8 text-m3-on-surface-variant/40" />
              <span className="text-xs font-bold text-m3-on-surface font-display">
                {t('noActiveHomework')}
              </span>
            </div>
          ) : (
            displayHomeworks.map((hw) => (
              <div
                key={hw.id}
                className="p-3 rounded-m3-xl bg-m3-surface-container-high flex items-start gap-3 transition-all hover:bg-m3-surface-container-highest m3-pressable"
              >
                {/* Checkbox toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleHomeworkDone(hw.id);
                  }}
                  className="mt-0.5 text-m3-primary hover:text-emerald-500 transition-colors m3-pressable shrink-0"
                  title={hw.done ? t('markAsUndone') : t('markAsDone')}
                >
                  {hw.done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500/20" />
                  ) : (
                    <Circle className="w-5 h-5 text-m3-outline hover:text-m3-primary" />
                  )}
                </button>

                {/* Assignment Details */}
                <div
                  onClick={() => setActiveScreen('homework')}
                  className="flex-1 min-w-0 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black px-2 py-0.5 rounded-full bg-m3-primary-container text-m3-on-primary-container font-display">
                      {hw.subjectAbbrev}
                    </span>
                    <div className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                      <Clock className="w-3 h-3" />
                      <span>{hw.deadline ? formatCzechDate(hw.deadline, 'short', language) : t('noHomeworkDeadline')}</span>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm font-semibold text-m3-on-surface mt-1 line-clamp-2 leading-snug">
                    {hw.content}
                  </p>

                  {hw.attachmentName && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-m3-primary">
                      <FileText className="w-3 h-3" />
                      <span className="truncate">{hw.attachmentName}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottom Button: '+N more assignments' if remaining exist, or 'View All' */}
        {remainingCount > 0 ? (
          <button
            type="button"
            onClick={() => setActiveScreen('homework')}
            className="w-full py-2.5 px-3 rounded-m3-xl bg-m3-primary-container/70 hover:bg-m3-primary-container text-m3-on-primary-container font-extrabold text-xs flex items-center justify-center gap-1.5 m3-pressable transition-all font-display"
          >
            <Plus className="w-4 h-4" />
            <span>{t('moreHomework', { count: remainingCount })}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setActiveScreen('homework')}
            className="w-full py-2 px-3 rounded-m3-xl bg-m3-surface-container-high text-m3-on-surface-variant hover:text-m3-primary text-xs font-bold flex items-center justify-center gap-1.5 m3-pressable transition-all font-display"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{t('showAllAssignments')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
