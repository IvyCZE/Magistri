import type { TimetableData, TimetableDay, TimetableHour } from '../types/bakalari';
import type { Language } from '../i18n/translations';
import { getHolidayInfo } from './holiday';
import { parseTimeToMinutes, toIsoDate } from './time';

export interface TimetableSources {
  actual: TimetableData;
  permanent: TimetableData;
  nextWeek?: TimetableData | null;
  /** The timetable the user is currently browsing, used as a last lookup for Monday. */
  browsed?: TimetableData | null;
  /** Looks up a cached week by the ISO date of its Monday. */
  getCachedWeek?: (mondayIso: string) => TimetableData | undefined;
}

export interface TimetableSelection {
  day: TimetableDay | undefined;
  hours: TimetableHour[];
  isPerm: boolean;
  isToday: boolean;
  isTomorrow: boolean;
  isNextMonday: boolean;
}

const hasAtoms = (d: any) => (d?.atoms?.length || 0) > 0;

/**
 * Chooses the school day the home screen should show:
 * - today while lessons are ahead or running (or today is a holiday before 17:00),
 * - otherwise the next valid day of this week,
 * - otherwise Monday (from the actual, next-week, cached or permanent timetable).
 *
 * A synthetic "today" day for a holiday has an empty `dayOfWeekName`; the caller
 * localises it.
 */
export function selectTimetableDay(now: Date, src: TimetableSources, lang: Language): TimetableSelection {
  const { actual, permanent } = src;
  const todayJs = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const isWeekend = todayJs === 0 || todayJs === 6;

  const isHolidayDay = (d: any) => Boolean(d && getHolidayInfo(d, lang).isHoliday);
  const isValidDay = (d: any) => hasAtoms(d) || isHolidayDay(d);
  const hoursList = actual.hours?.length ? actual.hours : permanent.hours;

  const isSchoolOverForDay = (dayData: any): boolean => {
    if (!dayData?.atoms || dayData.atoms.length === 0) return true;
    let maxEndMins = -1;
    dayData.atoms.forEach((atom: any) => {
      const h = hoursList?.find((hour: any) => Number(hour.id) === Number(atom.hourId));
      const endMins = parseTimeToMinutes(h?.endTime);
      if (endMins !== null && endMins > maxEndMins) {
        maxEndMins = endMins;
      }
    });
    const currentMins = now.getHours() * 60 + now.getMinutes();
    return maxEndMins > 0 ? currentMins >= maxEndMins : currentMins >= (15 * 60 + 30);
  };

  // Today: the actual timetable first, then the permanent one when the actual day
  // is empty and not a holiday.
  const todayIsoStr = toIsoDate(now);
  let todayDay = !isWeekend
    ? actual.days.find((d) => (d.date ? d.date.slice(0, 10) === todayIsoStr : d.dayOfWeek === todayJs))
    : undefined;
  const todayHoliday = getHolidayInfo(todayDay || todayIsoStr, lang);
  let isPerm = false;
  if (!isWeekend && !todayHoliday.isHoliday && (!todayDay || !hasAtoms(todayDay))) {
    const permDay = permanent.days.find((d) => d.dayOfWeek === todayJs);
    if (permDay && hasAtoms(permDay)) {
      todayDay = permDay;
      isPerm = true;
    }
  }
  const todayHasLessons = todayDay && hasAtoms(todayDay);
  const todaySchoolOver = !todayHasLessons || isSchoolOverForDay(todayDay);

  // 1) School is still ongoing or yet to start today, or today is a holiday.
  if (!isWeekend && ((todayHasLessons && !todaySchoolOver) || (todayHoliday.isHoliday && now.getHours() < 17))) {
    const enrichedDay = {
      ...(todayDay || { dayOfWeek: todayJs, dayOfWeekName: '', atoms: [] }),
      date: todayDay?.date ? todayDay.date.slice(0, 10) : todayIsoStr,
      dayDescription: todayDay?.dayDescription || todayHoliday.title,
    } as TimetableDay;
    return {
      day: enrichedDay,
      hours: isPerm ? permanent.hours : actual.hours,
      isPerm,
      isToday: true,
      isTomorrow: false,
      isNextMonday: false,
    };
  }

  // 2) School is over today (or today is a free weekday): next valid day this week.
  if (!isWeekend && todayJs < 5) {
    const nextDayInWeek = actual.days
      .filter((d) => isValidDay(d) && d.dayOfWeek > todayJs)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)[0];

    if (nextDayInWeek) {
      const daysAhead = nextDayInWeek.dayOfWeek - todayJs;
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysAhead);
      const enrichedDay = {
        ...nextDayInWeek,
        date: nextDayInWeek.date ? nextDayInWeek.date.slice(0, 10) : toIsoDate(targetDate),
      };
      return {
        day: enrichedDay,
        hours: actual.hours,
        isPerm: false,
        isToday: false,
        isTomorrow: daysAhead === 1,
        isNextMonday: false,
      };
    }
  }

  // 3) Friday after school, weekend, or nothing left this week: next Monday.
  const daysUntilMonday = todayJs === 0 ? 1 : todayJs === 6 ? 2 : todayJs === 5 ? 3 : (7 - todayJs + 1) % 7;
  const mondayDate = new Date(now);
  mondayDate.setDate(mondayDate.getDate() + daysUntilMonday);
  const targetMondayIso = toIsoDate(mondayDate);

  const isMatchForTargetMonday = (d: any) => {
    if (!d) return false;
    const matchesDate = d.date ? d.date.slice(0, 10) === targetMondayIso : (isWeekend && d.dayOfWeek === 1);
    return matchesDate && isValidDay(d);
  };

  let mondayDay = actual?.days?.find(isMatchForTargetMonday);
  let hours = actual?.hours?.length ? actual.hours : permanent.hours;
  let isMondayPerm = false;

  const nextWeek = src.nextWeek;
  if (!mondayDay && nextWeek?.days?.length) {
    const nextMon = nextWeek.days.find((d) => {
      const matchesDate = d.date ? d.date.slice(0, 10) === targetMondayIso : d.dayOfWeek === 1;
      return matchesDate && isValidDay(d);
    });
    if (nextMon) {
      mondayDay = nextMon;
      hours = nextWeek.hours?.length ? nextWeek.hours : hours;
    }
  }

  if (!mondayDay) {
    const cachedWeek = src.getCachedWeek?.(targetMondayIso);
    const cachedMon = cachedWeek?.days?.find(isMatchForTargetMonday);
    if (cachedMon) {
      mondayDay = cachedMon;
      hours = cachedWeek?.hours?.length ? cachedWeek.hours : hours;
    }
  }
  const browsed = src.browsed;
  if (!mondayDay && browsed?.days?.length) {
    const ttMon = browsed.days.find(isMatchForTargetMonday);
    if (ttMon) {
      mondayDay = ttMon;
      hours = browsed.hours?.length ? browsed.hours : hours;
    }
  }

  // The permanent timetable is only a fallback when Monday is nowhere else as a
  // valid day (neither lessons nor a holiday).
  if (!mondayDay) {
    const permMon = permanent.days.find((d) => d.dayOfWeek === 1 && hasAtoms(d))
      || permanent.days.filter((d) => hasAtoms(d)).sort((a, b) => a.dayOfWeek - b.dayOfWeek)[0];
    if (permMon) {
      mondayDay = permMon;
      hours = permanent.hours?.length ? permanent.hours : hours;
      isMondayPerm = true;
    }
  }

  if (mondayDay) {
    const enrichedDay = {
      ...mondayDay,
      date: mondayDay.date ? mondayDay.date.slice(0, 10) : targetMondayIso,
    };
    const isTomorrow = daysUntilMonday === 1;
    return {
      day: enrichedDay,
      hours,
      isPerm: isMondayPerm,
      isToday: false,
      isTomorrow,
      isNextMonday: !isTomorrow && (mondayDay.dayOfWeek === 1 || daysUntilMonday <= 3),
    };
  }

  return {
    day: undefined,
    hours: actual.hours,
    isPerm: false,
    isToday: false,
    isTomorrow: false,
    isNextMonday: false,
  };
}
