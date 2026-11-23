import React from 'react';
import { ChevronRight, Sparkles, Plus, CalendarDays, MapPin } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatCzechDate, formatCzechDateRange } from '../../utils/dateUtils';
import { formatEventStartTime } from '../../domain/eventTime';
import { getEventDurationDays, formatEventDuration, isEventOngoing } from '../../utils/eventUtils';

export const EventsWidget: React.FC = () => {
  const { events } = useDataStore();
  const { setActiveScreen, t } = useSettingsStore();

  const upcomingEvents = events
    .filter((e) => !e.isPast)
    .sort((a, b) => new Date(a.date.split('T')[0]).getTime() - new Date(b.date.split('T')[0]).getTime());
  const displayEvents = upcomingEvents.slice(0, 2);
  const remainingCount = upcomingEvents.length - 2;

  return (
    <div className="w-full flex flex-col gap-2.5 h-full">
      {/* Top Header Row */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base sm:text-lg font-bold font-display text-m3-on-surface flex items-center gap-2">
          {t('upcomingEvents')}
          {upcomingEvents.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-black rounded-full bg-m3-primary text-m3-on-primary font-display">
              {upcomingEvents.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => setActiveScreen('events')}
          className="text-xs font-bold text-m3-primary hover:underline flex items-center gap-1 font-display m3-pressable"
        >
          <span>{t('showAllEvents')}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Events Column Container */}
      <div className="p-3 sm:p-4 rounded-m3-2xl bg-m3-surface-container flex flex-col gap-2.5 flex-1 justify-between">
        <div className="flex flex-col gap-2.5">
          {displayEvents.length === 0 ? (
            <div className="py-6 flex flex-col items-center justify-center text-center gap-2 text-m3-on-surface-variant">
              <CalendarDays className="w-8 h-8 text-m3-on-surface-variant/40" />
              <span className="text-xs font-bold text-m3-on-surface-variant font-display">
                {t('noUpcomingEvents')}
              </span>
            </div>
          ) : (
            displayEvents.map((ev) => {
              const isMultiDay = Boolean(ev.endDate && ev.endDate !== ev.date);
              const durationDays = isMultiDay ? getEventDurationDays(ev.date, ev.endDate) : 1;
              const ongoing = !ev.isPast && isEventOngoing(ev);

              return (
                <div
                  key={ev.id}
                  onClick={() => setActiveScreen('events')}
                  className="p-3 rounded-m3-xl bg-m3-surface-container-high flex flex-col gap-1 cursor-pointer hover:bg-m3-surface-container-highest transition-all m3-pressable"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="text-[11px] font-extrabold text-m3-primary font-display truncate">
                        {isMultiDay
                          ? formatCzechDateRange(ev.date, ev.endDate, 'short')
                          : formatCzechDate(ev.date, 'short')}
                        {ev.time ? ` • ${formatEventStartTime(ev.time, ev.date)}` : ''}
                      </span>
                      {isMultiDay && (
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold font-display bg-m3-primary/10 text-m3-primary shrink-0">
                          {formatEventDuration(durationDays)}
                        </span>
                      )}
                      {ongoing && (
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold font-display bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                          {t('ongoing')}
                        </span>
                      )}
                    </div>
                    {ev.location && (
                      <span className="text-[10px] text-m3-on-surface-variant flex items-center gap-0.5 truncate max-w-[110px] shrink-0">
                        <MapPin className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{ev.location}</span>
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-bold text-m3-on-surface line-clamp-1">
                    {ev.title}
                  </h4>

                  <p className="text-[11px] text-m3-on-surface-variant line-clamp-2">
                    {ev.description}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* 3rd item: Persistent '+N upcoming events' button if more exist, or 'View All' */}
        {remainingCount > 0 ? (
          <button
            onClick={() => setActiveScreen('events')}
            className="w-full py-2.5 px-3 rounded-m3-xl bg-m3-secondary-container/70 hover:bg-m3-secondary-container text-m3-on-secondary-container font-extrabold text-xs flex items-center justify-center gap-1.5 m3-pressable transition-all font-display"
          >
            <Plus className="w-4 h-4" />
            <span>{t('moreEvents', { count: remainingCount })}</span>
          </button>
        ) : (
          <button
            onClick={() => setActiveScreen('events')}
            className="w-full py-2 px-3 rounded-m3-xl bg-m3-surface-container-high text-m3-on-surface-variant hover:text-m3-primary text-xs font-bold flex items-center justify-center gap-1.5 m3-pressable transition-all font-display"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('showAllEvents')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
