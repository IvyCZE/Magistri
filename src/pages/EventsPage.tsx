import React, { useState } from 'react';
import {
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  User,
  CalendarDays,
} from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { formatEventDate, formatEventTime } from '../domain/eventTime';
import { getEventDurationDays, formatEventDuration, isEventOngoing } from '../utils/eventUtils';
import { groupRadius } from '../utils/groupRadius';

type EventsTab = 'upcoming' | 'past';

export const EventsPage: React.FC = () => {
  const { events } = useDataStore();
  const { t, language: lang } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<EventsTab>('upcoming');

  const upcomingEvents = events
    .filter((e) => !e.isPast)
    .sort((a, b) => new Date(a.date.split('T')[0]).getTime() - new Date(b.date.split('T')[0]).getTime());

  const pastEvents = events
    .filter((e) => e.isPast)
    .sort((a, b) => {
      const endA = a.endDate || a.date;
      const endB = b.endDate || b.date;
      return new Date(endB.split('T')[0]).getTime() - new Date(endA.split('T')[0]).getTime();
    });

  const displayEvents = activeTab === 'upcoming' ? upcomingEvents : pastEvents;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-5 flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex flex-col gap-1 px-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-m3-on-surface">
          {t('events')}
        </h1>
        <p className="text-xs sm:text-sm text-m3-on-surface-variant font-medium">
          {t('eventsSubtitle')}
        </p>
      </div>

      {/* Tabs: Upcoming vs Past */}
      <div className="flex items-center p-1.5 rounded-full bg-m3-surface-container gap-1 self-start max-w-full overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold font-display transition-all m3-pressable flex items-center gap-1.5 shrink-0 ${
            activeTab === 'upcoming'
              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface'
          }`}
        >
          <span>{t('tabUpcoming')}</span>
          {upcomingEvents.length > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] font-black rounded-full bg-m3-surface/30">
              {upcomingEvents.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('past')}
          className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold font-display transition-all m3-pressable shrink-0 ${
            activeTab === 'past'
              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface'
          }`}
        >
          {t('tabPastEvents')}
        </button>
      </div>

      {/* Events List */}
      <div className="flex flex-col gap-1.5">
        {displayEvents.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center gap-2 rounded-m3-2xl bg-m3-surface-container text-m3-on-surface-variant">
            <CalendarDays className="w-10 h-10 text-m3-on-surface-variant/40" />
            <span className="text-sm font-bold font-display text-m3-on-surface">
              {activeTab === 'upcoming'
                ? t('noUpcomingEventsArch')
                : t('noPastEventsArch')}
            </span>
          </div>
        ) : (
          displayEvents.map((ev, evIndex) => {
            const isMultiDay = Boolean(ev.endDate && ev.endDate !== ev.date);
            const durationDays = isMultiDay ? getEventDurationDays(ev.date, ev.endDate) : 1;
            const ongoing = !ev.isPast && isEventOngoing(ev);

            return (
              <div
                key={ev.id}
                className={`p-4 sm:p-5 ${groupRadius(evIndex, displayEvents.length)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex flex-col gap-3 shadow-xs`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-m3-primary flex-wrap">
                    <Calendar className="w-4 h-4 shrink-0" />
                    <span className="font-display font-extrabold">
                      {formatEventDate(ev.date, ev.endDate, lang) || ev.date}
                    </span>
                    {isMultiDay && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-display bg-m3-primary/10 text-m3-primary">
                        {formatEventDuration(durationDays)}
                      </span>
                    )}
                    {ongoing && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-display bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {t('ongoing')}
                      </span>
                    )}
                    {ev.time && (
                      <span className="text-m3-on-surface-variant font-medium">
                        • {formatEventTime(ev.time, ev.date)}
                      </span>
                    )}
                  </div>

                  {ev.location && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-m3-on-surface-variant px-2.5 py-0.5 rounded-full bg-m3-surface-container-high">
                      <MapPin className="w-3.5 h-3.5 text-m3-primary" />
                      {ev.location}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-black font-display text-m3-on-surface">
                    {ev.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-m3-on-surface-variant mt-1 leading-relaxed">
                    {ev.description}
                  </p>
                </div>

                {ev.organizer && (
                  <div className="flex items-center gap-1.5 text-xs text-m3-on-surface-variant/80 pt-2">
                    <User className="w-3.5 h-3.5 text-m3-primary" />
                    <span>{t('organizerPrefix', { name: ev.organizer })}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
