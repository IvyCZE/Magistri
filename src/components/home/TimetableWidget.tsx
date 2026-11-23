import React, { useLayoutEffect, useRef, useState } from 'react';
import { Calendar, CalendarDays, ChevronRight, Loader2 } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { LessonCard } from '../common/LessonCard';
import { formatCzechDate, getAppDate, getAppLanguage, getCurrentTimetableHour, parseTimeToMinutes, getTimetableHourProgress, formatHourTime, getDayOfWeekName } from '../../utils/dateUtils';
import { getHolidayInfo } from '../../utils/holidayUtils';
import { selectTimetableDay } from '../../domain/timetableSelection';

export const TimetableWidget: React.FC = () => {
  const {
    actualTimetable,
    permanentTimetable,
    nextWeekTimetable,
    timetable,
    getCachedTimetableWeek,
    testMarks,
    lastUpdated,
    isTimetableLoading,
    isRefreshing,
  } = useDataStore();
  const { setActiveScreen, t } = useSettingsStore();

  // Keep current app date & time reactive to lastUpdated and 60s interval
  const [now, setNow] = React.useState<Date>(() => getAppDate());
  React.useEffect(() => {
    setNow(getAppDate());
    const timer = setInterval(() => setNow(getAppDate()), 60000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  const todayJs = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const isWeekend = todayJs === 0 || todayJs === 6;


  // Show the nearest relevant school day:
  // - If today is a school day and lessons are still ongoing / ahead: show TODAY ("Dnešní rozvrh")
  // - When school has ended for today ("po škole"): switch to TOMORROW ("Zítřejší rozvrh") with tomorrow's date & schedule!
  // - On Friday after school or Saturday: show Monday ("Rozvrh na pondělí")
  // - On Sunday: show Monday ("Zítřejší rozvrh")
  const selection = React.useMemo(() => {
    const result = selectTimetableDay(
      now,
      {
        actual: actualTimetable,
        permanent: permanentTimetable,
        nextWeek: nextWeekTimetable,
        browsed: timetable,
        getCachedWeek: getCachedTimetableWeek,
      },
      getAppLanguage()
    );
    if (result.day && !result.day.dayOfWeekName) {
      return { ...result, day: { ...result.day, dayOfWeekName: getDayOfWeekName(result.day.dayOfWeek) } };
    }
    return result;
  }, [actualTimetable, permanentTimetable, nextWeekTimetable, timetable, getCachedTimetableWeek, now]);

  const todayData = selection.day;
  const isShowingPermanent = selection.isPerm;

  // Base list of all hours defined by school or fallback to 1..8
  const allHours = selection.hours && selection.hours.length > 0
    ? selection.hours
    : [1, 2, 3, 4, 5, 6, 7, 8].map((h) => ({
        id: h,
        caption: `${h}`,
        beginTime: `${7 + h}:00`,
        endTime: `${7 + h}:45`,
      }));

  // Dynamic clever hours: only display hours up to the max scheduled lesson for today
  const effectiveHours = React.useMemo(() => {
    if (!todayData?.atoms || todayData.atoms.length === 0) {
      return [];
    }

    let minHour = Infinity;
    let maxHour = -Infinity;

    todayData.atoms.forEach((atom) => {
      if (atom.hourId < minHour) minHour = atom.hourId;
      if (atom.hourId > maxHour) maxHour = atom.hourId;
    });

    if (!isFinite(minHour) || !isFinite(maxHour)) {
      return [];
    }

    // Clip strictly to the scheduled range: "0. hodina" (or any other edge hour
    // the school defines but never schedules) shows only when a lesson really
    // sits in it.
    return allHours.filter((h) => h.id >= minHour && h.id <= maxHour);
  }, [todayData, allHours]);

  const currentHour = React.useMemo(() => {
    if (!selection.isToday || isWeekend) return undefined;
    return getCurrentTimetableHour(effectiveHours, now);
  }, [selection.isToday, isWeekend, effectiveHours, now]);

  const hourProgress = React.useMemo(() => {
    return getTimetableHourProgress(currentHour, now);
  }, [currentHour, now]);

  const widgetScrollRef = React.useRef<HTMLDivElement>(null);
  const lastWidgetScrollKey = React.useRef<string>('');

  React.useEffect(() => {
    if (!todayData || effectiveHours.length === 0) return;

    // Resolve active hour and next hour
    let activeHour: (typeof effectiveHours)[0] | undefined;
    let nextHour: (typeof effectiveHours)[0] | undefined;

    if (selection.isToday && !isWeekend) {
      const nowMin = now.getHours() * 60 + now.getMinutes();

      // Check if we are currently inside an ongoing lesson
      const ongoingIdx = effectiveHours.findIndex((h) => {
        const b = parseTimeToMinutes(h.beginTime);
        const e = parseTimeToMinutes(h.endTime);
        return b !== null && e !== null && nowMin >= b && nowMin <= e;
      });

      if (ongoingIdx >= 0) {
        // Ongoing lesson: show ongoing lesson + next upcoming lesson
        activeHour = effectiveHours[ongoingIdx];
        nextHour = effectiveHours[ongoingIdx + 1];
      } else {
        // Not in lesson: break between lessons or before school
        // When it's a break, show the 2 upcoming lessons
        const upcomingIdx = effectiveHours.findIndex((h) => {
          const b = parseTimeToMinutes(h.beginTime);
          return b !== null && nowMin < b;
        });

        if (upcomingIdx >= 0) {
          activeHour = effectiveHours[upcomingIdx];
          nextHour = effectiveHours[upcomingIdx + 1];
        } else {
          // School is over for today
          activeHour = effectiveHours[effectiveHours.length - 1];
        }
      }
    } else {
      activeHour = effectiveHours[0];
      nextHour = effectiveHours[1];
    }

    if (!activeHour) return;

    const scrollKey = `${todayData.date || todayData.dayOfWeek}_${activeHour.id}`;
    if (lastWidgetScrollKey.current === scrollKey) return;

    const timer = setTimeout(() => {
      if (!widgetScrollRef.current) return;
      const container = widgetScrollRef.current;
      const activeCard = container.querySelector(
        `[data-widget-hour="${activeHour.id}"]`
      ) as HTMLElement | null;
      const nextCard = nextHour
        ? (container.querySelector(`[data-widget-hour="${nextHour.id}"]`) as HTMLElement | null)
        : null;

      if (activeCard) {
        const containerWidth = container.clientWidth;
        const currentScroll = container.scrollLeft;

        const aLeft = activeCard.offsetLeft;
        const aRight = aLeft + activeCard.offsetWidth;

        const nRight = nextCard ? nextCard.offsetLeft + nextCard.offsetWidth : aRight;

        // Check if both target lessons are already 100% visible
        const isBothVisible = aLeft >= currentScroll && nRight <= currentScroll + containerWidth;

        if (isBothVisible) {
          lastWidgetScrollKey.current = scrollKey;
          return;
        }

        // Align activeCard near the left (12px margin), so both target lessons are side-by-side in full view
        const targetScroll = Math.max(0, aLeft - 12);

        if (Math.abs(targetScroll - currentScroll) > 4) {
          container.scrollTo({
            left: targetScroll,
            behavior: 'smooth',
          });
        }
        lastWidgetScrollKey.current = scrollKey;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [selection.isToday, isWeekend, currentHour, todayData, effectiveHours, now]);

  const shownHoliday = React.useMemo(() => {
    return todayData ? getHolidayInfo(todayData) : getHolidayInfo(now);
  }, [todayData, now]);

  // The header must stay on one line: when "Pondělí (23.11.)" does not fit, the pill shows only the date.
  // The width the full header needs is measured while it is shown in full, then compared with the
  // available width, so a resize or a late font swap never makes it flip back and forth.
  const headerRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [needed, setNeeded] = useState<{ key: string; width: number } | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  const dayName = todayData ? getDayOfWeekName(todayData.dayOfWeek || todayData.dayOfWeekName) : t('monday');
  const shortDate = todayData?.date ? formatCzechDate(todayData.date, 'short') : '';
  const contentKey = `${dayName}|${shortDate}|${selection.isToday}|${selection.isTomorrow}|${selection.isNextMonday}|${isShowingPermanent}|${isTimetableLoading || isRefreshing}|${getAppLanguage()}`;
  const compact = Boolean(shortDate) && needed?.key === contentKey && needed.width > availableWidth;
  const compactRef = useRef(compact);
  const contentKeyRef = useRef(contentKey);
  compactRef.current = compact;
  contentKeyRef.current = contentKey;
  const dayPillText = todayData
    ? compact
      ? shortDate
      : `${dayName}${shortDate ? ` (${shortDate})` : ''}`
    : dayName;

  const measureHeader = React.useCallback(() => {
    const el = headerRef.current;
    if (!el || compactRef.current) return;
    const style = getComputedStyle(el);
    const gap = parseFloat(style.columnGap) || 0;
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const kids = Array.from(el.children) as HTMLElement[];
    const width = kids.reduce((sum, kid) => sum + kid.getBoundingClientRect().width, 0) + gap * Math.max(0, kids.length - 1) + padding;
    const key = contentKeyRef.current;
    setNeeded((prev) => (prev && prev.key === key && Math.abs(prev.width - width) < 0.5 ? prev : { key, width }));
  }, []);

  useLayoutEffect(() => {
    measureHeader();
  }, [contentKey, fontsTick, measureHeader]);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => {
      setAvailableWidth(el.clientWidth);
      measureHeader();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    Array.from(el.children).forEach((kid) => observer.observe(kid));
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (cancelled) return;
      setNeeded(null);
      setFontsTick((tick) => tick + 1);
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [measureHeader]);

  return (
    <div className="w-full flex flex-col gap-2.5">
      {/* Top Header Row */}
      <div ref={headerRef} className="flex items-center justify-between gap-2 px-1 whitespace-nowrap">
        <div className="flex shrink-0 items-center gap-2">
          <h3 className="text-base sm:text-lg font-bold font-display text-m3-on-surface">
            {selection.isToday
              ? t('todayTimetable')
              : selection.isTomorrow
                ? t('tomorrowTimetable')
                : selection.isNextMonday
                  ? t('nextMondayTimetable')
                  : t('upcomingTimetable')}
          </h3>
          <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-m3-primary-container text-m3-on-primary-container font-display flex items-center gap-1.5">
            <span>{dayPillText}</span>
            {isTimetableLoading || isRefreshing ? (
              <Loader2 className="w-3 h-3 animate-spin opacity-80" />
            ) : (
              isShowingPermanent && !shownHoliday.isHoliday && <span className="opacity-75 font-normal text-[10px]">• {t('permanentScheduleShort')}</span>
            )}
          </span>
        </div>

        {/* Direct Link to Full Timetable Screen */}
        <button
          onClick={() => setActiveScreen('timetable')}
          className="shrink-0 text-xs font-bold text-m3-primary hover:underline flex items-center gap-0.5 font-display m3-pressable py-1 px-2 rounded-full hover:bg-m3-primary/10 transition-colors"
        >
          <span>{t('timetable')}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Single Horizontal Row for Selected Day's Timetable */}
      <div className="p-3 sm:p-3.5 rounded-m3-2xl bg-m3-surface-container shadow-xs touch-pan-x touch-pan-y">
        {todayData && effectiveHours.length > 0 ? (
          <div ref={widgetScrollRef} className="relative flex items-center gap-2 touch-scroll-x pb-0.5 no-scrollbar">
            {effectiveHours.map((hour) => {
              const lesson = todayData.atoms?.find((a) => Number(a.hourId) === Number(hour.id));
              const isHourCurrent = selection.isToday && Number(currentHour?.id) === Number(hour.id);
              const hourNum = (hour.caption || `${hour.id}`).replace(/\.$/, '');
              const timeRange = hour.beginTime && hour.endTime
                ? `${formatHourTime(hour.beginTime)} - ${formatHourTime(hour.endTime)}`
                : formatHourTime(hour.beginTime || hour.endTime);
              return (
                <div key={hour.id} data-widget-hour={hour.id} className="relative flex flex-col items-center gap-1 shrink-0">
                  <span
                    className={`text-[10px] font-bold leading-none font-display transition-colors whitespace-nowrap ${
                      isHourCurrent ? 'text-m3-primary font-black' : 'text-m3-on-surface-variant/70'
                    }`}
                  >
                    {timeRange ? `${hourNum}. ${timeRange}` : `${hourNum}.`}
                  </span>
                  <div className="relative">
                    <LessonCard
                      lesson={lesson}
                      hour={hour}
                      variant="widget"
                      isOngoing={isHourCurrent}
                      testMark={!isShowingPermanent && todayData ? testMarks.find((m) => m.date === todayData.date && Number(m.hourId) === Number(hour.id)) || null : null}
                      onClick={() => setActiveScreen('timetable')}
                    />

                    {/* Straight vertical timeline indicator for active hour on widget */}
                    {isHourCurrent && (
                      <div
                        className="absolute top-0 bottom-0 z-30 pointer-events-none -translate-x-1/2"
                        style={{
                          left: `clamp(6px, ${hourProgress * 100}%, calc(100% - 6px))`,
                        }}
                      >
                        <div className="w-[2px] h-full bg-m3-primary shadow-xs" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : isTimetableLoading ? (
          <div className="py-6 flex flex-col items-center justify-center text-center gap-2 text-m3-on-surface-variant">
            <Loader2 className="w-6 h-6 animate-spin text-m3-primary" />
            <span className="text-xs font-medium text-m3-on-surface-variant/70">
              {t('loading')}
            </span>
          </div>
        ) : shownHoliday.isHoliday ? (
          <div
            onClick={() => setActiveScreen('timetable')}
            className="w-full h-[74px] sm:h-[80px] rounded-m3-xl px-4 sm:px-6 flex items-center justify-between gap-3 cursor-pointer transition-all select-none shadow-xs group bg-gradient-to-r from-sky-500/15 via-sky-500/10 to-sky-500/5 hover:bg-sky-500/20"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform bg-sky-500/20 text-sky-600 dark:text-sky-400">
                <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/25 text-sky-700 dark:text-sky-300">
                    {shownHoliday.badgeLabel}
                  </span>
                  <span className="text-xs font-medium text-m3-on-surface-variant/80 hidden sm:inline">
                    {t('dayOffNotice')}
                  </span>
                </div>
                <h4 className="text-sm sm:text-base font-black font-display text-m3-on-surface truncate mt-0.5">
                  {shownHoliday.title}
                </h4>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 flex flex-col items-center justify-center text-center gap-1 text-m3-on-surface-variant">
            <Calendar className="w-7 h-7 text-m3-on-surface-variant/40" />
            <span className="text-xs font-semibold">
              {selection.isTomorrow ? t('noLessonsTomorrow') : t('noLessonsToday')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
