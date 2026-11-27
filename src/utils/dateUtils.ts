import { Language } from '../i18n/translations';
import { parseTimeToMinutes } from '../domain/time';

export function getAppLanguage(): Language {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('b_language');
      if (stored === 'en' || stored === 'cs') return stored;
    } catch {}
  }
  return 'cs';
}

const EN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Date and Time Formatting Utilities for Bakaláři
 * Formats dates in either Czech (DD. MM. / DD. MM. YYYY) or English (MMM DD / MMM DD, YYYY)
 * depending on current language or optional override.
 */
export function formatCzechDate(
  dateInput: string | Date | undefined | null,
  format: 'short' | 'full' | 'withTime' | 'time' = 'short',
  lang?: Language
): string {
  if (!dateInput) return '';

  const activeLang = lang || getAppLanguage();

  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;
  let hours: string | undefined;
  let minutes: string | undefined;

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();

    // 1. Check YYYY-MM-DD (ISO date format)
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      month = parseInt(isoMatch[2], 10);
      day = parseInt(isoMatch[3], 10);
      if (isoMatch[4] && isoMatch[5]) {
        hours = isoMatch[4];
        minutes = isoMatch[5];
      }
    } else {
      // 2. Check Czech dot format (e.g. "31.8.2026", "31. 8. 2026", "31.08.")
      const dotMatch = trimmed.match(/^(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{4}))?(?:[T\s](\d{2}):(\d{2}))?/);
      if (dotMatch) {
        day = parseInt(dotMatch[1], 10);
        month = parseInt(dotMatch[2], 10);
        if (dotMatch[3]) {
          year = parseInt(dotMatch[3], 10);
        }
        if (dotMatch[4] && dotMatch[5]) {
          hours = dotMatch[4];
          minutes = dotMatch[5];
        }
      } else {
        // Fallback to Date parser
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) {
          day = parsed.getDate();
          month = parsed.getMonth() + 1;
          year = parsed.getFullYear();
          hours = parsed.getHours().toString().padStart(2, '0');
          minutes = parsed.getMinutes().toString().padStart(2, '0');
        }
      }
    }
  } else if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    day = dateInput.getDate();
    month = dateInput.getMonth() + 1;
    year = dateInput.getFullYear();
    hours = dateInput.getHours().toString().padStart(2, '0');
    minutes = dateInput.getMinutes().toString().padStart(2, '0');
  }

  if (day === undefined || month === undefined) {
    return typeof dateInput === 'string' ? dateInput : '';
  }

  if (format === 'time') {
    return hours && minutes ? `${hours}:${minutes}` : '';
  }

  if (activeLang === 'en') {
    const monthStr = EN_MONTHS_SHORT[month - 1] || `${month}`;
    if (format === 'short') {
      return `${monthStr} ${day}`;
    }
    if (format === 'withTime') {
      const datePart = year ? `${monthStr} ${day}, ${year}` : `${monthStr} ${day}`;
      return hours && minutes ? `${datePart} ${hours}:${minutes}` : datePart;
    }
    // format === 'full'
    return year ? `${monthStr} ${day}, ${year}` : `${monthStr} ${day}`;
  }

  // format outputs for Czech
  if (format === 'short') {
    return `${day}. ${month}.`;
  }

  if (format === 'withTime') {
    const datePart = year ? `${day}. ${month}. ${year}` : `${day}. ${month}.`;
    return hours && minutes ? `${datePart} ${hours}:${minutes}` : datePart;
  }

  // format === 'full'
  return year ? `${day}. ${month}. ${year}` : `${day}. ${month}.`;
}

export function formatMessageDate(date: string | undefined, format: 'short' | 'withTime'): string {
  if (date && /[T ]\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(date)) {
    const instant = new Date(date);
    if (Number.isFinite(instant.getTime())) return formatCzechDate(instant, format);
  }
  return formatCzechDate(date, format);
}

/**
 * Formats a date range cleanly according to language.
 * Czech: "31. 8. – 4. 9." or "15. – 19. 9. 2026"
 * English: "Aug 31 – Sep 4" or "Sep 15 – 19, 2026"
 */
export function formatCzechDateRange(
  startDateInput: string | Date | undefined | null,
  endDateInput: string | Date | undefined | null,
  format: 'short' | 'full' = 'short',
  lang?: Language
): string {
  if (!startDateInput && !endDateInput) return '';
  if (!startDateInput) return formatCzechDate(endDateInput, format, lang);
  if (!endDateInput) return formatCzechDate(startDateInput, format, lang);

  const activeLang = lang || getAppLanguage();

  const startD = typeof startDateInput === 'string'
    ? new Date(startDateInput.split('T')[0] + 'T00:00:00')
    : startDateInput;
  const endD = typeof endDateInput === 'string'
    ? new Date(endDateInput.split('T')[0] + 'T00:00:00')
    : endDateInput;

  if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
    const startStr = formatCzechDate(startDateInput, format, activeLang);
    const endStr = formatCzechDate(endDateInput, format, activeLang);
    return startStr === endStr ? startStr : `${startStr} – ${endStr}`;
  }

  const sDay = startD.getDate();
  const sMonth = startD.getMonth() + 1;
  const sYear = startD.getFullYear();

  const eDay = endD.getDate();
  const eMonth = endD.getMonth() + 1;
  const eYear = endD.getFullYear();

  // If same day
  if (sDay === eDay && sMonth === eMonth && sYear === eYear) {
    return formatCzechDate(startD, format, activeLang);
  }

  if (activeLang === 'en') {
    const sMStr = EN_MONTHS_SHORT[sMonth - 1] || `${sMonth}`;
    const eMStr = EN_MONTHS_SHORT[eMonth - 1] || `${eMonth}`;

    if (format === 'short') {
      if (sMonth === eMonth && sYear === eYear) {
        return `${sMStr} ${sDay} – ${eDay}`;
      }
      return `${sMStr} ${sDay} – ${eMStr} ${eDay}`;
    }

    if (sYear === eYear) {
      if (sMonth === eMonth) {
        return `${sMStr} ${sDay} – ${eDay}, ${sYear}`;
      }
      return `${sMStr} ${sDay} – ${eMStr} ${eDay}, ${sYear}`;
    }
    return `${sMStr} ${sDay}, ${sYear} – ${eMStr} ${eDay}, ${eYear}`;
  }

  if (format === 'short') {
    if (sMonth === eMonth && sYear === eYear) {
      return `${sDay}. – ${eDay}. ${eMonth}.`;
    }
    return `${sDay}. ${sMonth}. – ${eDay}. ${eMonth}.`;
  }

  // format === 'full'
  if (sYear === eYear) {
    if (sMonth === eMonth) {
      return `${sDay}. – ${eDay}. ${eMonth}. ${sYear}`;
    }
    return `${sDay}. ${sMonth}. – ${eDay}. ${eMonth}. ${sYear}`;
  }
  return `${sDay}. ${sMonth}. ${sYear} – ${eDay}. ${eMonth}. ${eYear}`;
}

export function getDayOfWeekName(
  day: number | string | undefined | null,
  lang: Language = getAppLanguage(),
  short: boolean = false
): string {
  let dayNum = 1;
  if (typeof day === 'number') {
    dayNum = day % 7;
  } else if (typeof day === 'string') {
    const lower = day.toLowerCase().trim();
    if (lower.startsWith('po') || lower.startsWith('mon')) dayNum = 1;
    else if (lower.startsWith('út') || lower.startsWith('ut') || lower.startsWith('tue')) dayNum = 2;
    else if (lower.startsWith('st') || lower.startsWith('wed')) dayNum = 3;
    else if (lower.startsWith('čt') || lower.startsWith('ct') || lower.startsWith('thu')) dayNum = 4;
    else if (lower.startsWith('pá') || lower.startsWith('pa') || lower.startsWith('fri')) dayNum = 5;
    else if (lower.startsWith('so') || lower.startsWith('sat')) dayNum = 6;
    else if (lower.startsWith('ne') || lower.startsWith('sun')) dayNum = 0;
  }

  const csNames = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
  const csShort = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  const enNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const enShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (lang === 'en') {
    return short ? enShort[dayNum] : enNames[dayNum];
  }
  return short ? csShort[dayNum] : csNames[dayNum];
}

export function formatDateWithDay(dateStr: string, lang: Language = getAppLanguage()): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return formatCzechDate(dateStr, 'full', lang);

  const dayOfWeek = d.getDay();
  const dayName = getDayOfWeekName(dayOfWeek, lang, false);
  const dayNum = d.getDate();
  const year = d.getFullYear();

  if (lang === 'en') {
    const enMonths = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${dayName}, ${enMonths[d.getMonth()]} ${dayNum}, ${year}`;
  }

  const csMonths = [
    'ledna', 'února', 'března', 'dubna', 'května', 'června',
    'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'
  ];
  return `${dayName} ${dayNum}. ${csMonths[d.getMonth()]} ${year}`;
}

/**
 * Returns the current date for the application.
 * Defaults to the real current system date (new Date()).
 *
 * Can be overridden for testing/simulation via:
 * 1. URL search or hash search param: `?simDay=mon|tue|wed|thu|fri`, `?simDate=YYYY-MM-DD`, or `?real=true`
 * 2. window.__SIMULATED_DATE__ (string YYYY-MM-DD or Date object)
 * 3. localStorage `b_simulated_date` ('real' for actual system date, or date string)
 */
export function getAppDate(): Date {
  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const hashQuery = window.location.hash.includes('?')
        ? window.location.hash.split('?')[1]
        : '';
      const hashParams = new URLSearchParams(hashQuery);

      // Explicit request for real system date
      if (urlParams.get('real') === 'true' || hashParams.get('real') === 'true') {
        return new Date();
      }

      // localStorage override
      const storageDate = localStorage.getItem('b_simulated_date');
      if (storageDate === 'real') {
        return new Date();
      }
      if (storageDate) {
        const d = new Date(storageDate);
        if (!isNaN(d.getTime())) return d;
      }

      // window global override
      const winDate = (window as any).__SIMULATED_DATE__;
      if (winDate) {
        const d = new Date(winDate);
        if (!isNaN(d.getTime())) return d;
      }

      let resolvedDate: Date | null = null;

      // URL param: specific date
      const simDate = urlParams.get('simDate') || hashParams.get('simDate');
      if (simDate) {
        const d = new Date(simDate);
        if (!isNaN(d.getTime())) resolvedDate = d;
      }

      // URL param: day of week
      if (!resolvedDate) {
        const simDayRaw = (urlParams.get('simDay') || hashParams.get('simDay') || '').toLowerCase().trim();
        if (simDayRaw) {
          let targetDay: number | null = null;
          if (/^[0-6]$/.test(simDayRaw)) {
            targetDay = parseInt(simDayRaw, 10);
          } else if (simDayRaw.startsWith('po') || simDayRaw.startsWith('mon')) {
            targetDay = 1;
          } else if (simDayRaw.startsWith('út') || simDayRaw.startsWith('ut') || simDayRaw.startsWith('tue')) {
            targetDay = 2;
          } else if (simDayRaw.startsWith('st') || simDayRaw.startsWith('wed')) {
            targetDay = 3;
          } else if (simDayRaw.startsWith('čt') || simDayRaw.startsWith('ct') || simDayRaw.startsWith('thu')) {
            targetDay = 4;
          } else if (simDayRaw.startsWith('pá') || simDayRaw.startsWith('pa') || simDayRaw.startsWith('fri')) {
            targetDay = 5;
          } else if (simDayRaw.startsWith('so') || simDayRaw.startsWith('sat')) {
            targetDay = 6;
          } else if (simDayRaw.startsWith('ne') || simDayRaw.startsWith('sun')) {
            targetDay = 0;
          }

          if (targetDay !== null) {
            const d = new Date();
            const currentDay = d.getDay();
            const diff = targetDay - currentDay;
            d.setDate(d.getDate() + diff);
            resolvedDate = d;
          }
        }
      }

      const d = resolvedDate || new Date();

      // Optional time simulation: ?simTime=10:15 or ?simHour=3
      const simTime = urlParams.get('simTime') || hashParams.get('simTime');
      const simHour = urlParams.get('simHour') || hashParams.get('simHour') || (window as any).__SIMULATED_HOUR__;
      if (simTime && /^(\d{1,2}):(\d{2})/.test(String(simTime))) {
        const [hh, mm] = String(simTime).split(':').map(Number);
        d.setHours(hh, mm, 0, 0);
      } else if (simHour && /^\d+$/.test(String(simHour))) {
        const hIdx = parseInt(String(simHour), 10);
        const defaultTimes: Record<number, [number, number]> = {
          1: [8, 15],
          2: [9, 15],
          3: [10, 15],
          4: [11, 15],
          5: [12, 15],
          6: [13, 0],
          7: [13, 55],
          8: [14, 45],
        };
        const mapped = defaultTimes[hIdx] || [8 + (hIdx - 1), 15];
        d.setHours(mapped[0], mapped[1], 0, 0);
      }

      return d;
    } catch {
      // ignore
    }
  }

  // Default to real current system date
  return new Date();
}

/**
 * Parses time string like "08:00", "8:00", or ISO datetime "2026-09-10T08:00:00" into total minutes from midnight.
 */
export { parseTimeToMinutes };

/**
 * Formats a time string or ISO timestamp cleanly as "HH:mm".
 */
export function formatHourTime(timeStr?: string | null): string {
  if (!timeStr) return '';
  const trimmed = String(timeStr).trim();
  const match = trimmed.match(/(?:^|T|\s)(\d{1,2}):(\d{2})/);
  if (!match) return timeStr;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/**
 * Computes progress (0.0 to 1.0) through a timetable hour based on currentDate.
 */
export function getTimetableHourProgress(
  hour?: { beginTime?: string; endTime?: string } | null,
  currentDate: Date = getAppDate()
): number {
  if (!hour || !hour.beginTime || !hour.endTime) return 0;
  const b = parseTimeToMinutes(hour.beginTime);
  const e = parseTimeToMinutes(hour.endTime);
  if (b === null || e === null || e <= b) return 0;
  const nowMin = currentDate.getHours() * 60 + currentDate.getMinutes() + currentDate.getSeconds() / 60;
  if (nowMin < b) return 0;
  if (nowMin > e) return 1;
  return (nowMin - b) / (e - b);
}

/**
 * Finds the timetable hour that is currently active for the given date/time.
 * Considers:
 * 1. Inside lesson time (beginTime <= currentMinutes <= endTime)
 * 2. During the break before a lesson (previousEndTime < currentMinutes < beginTime, or up to 20m before)
 * 3. Up to 15 minutes before the first lesson of the day
 */
export function getCurrentTimetableHour<T extends { id: number; beginTime?: string; endTime?: string }>(
  hours: T[],
  currentDate: Date = getAppDate()
): T | undefined {
  if (!hours || hours.length === 0) return undefined;
  const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();

  // Sort hours chronologically by beginTime
  const sorted = [...hours].sort((a, b) => {
    const ta = parseTimeToMinutes(a.beginTime) ?? 0;
    const tb = parseTimeToMinutes(b.beginTime) ?? 0;
    return ta - tb;
  });

  // 1. Direct match: inside lesson time
  const ongoing = sorted.find((h) => {
    const b = parseTimeToMinutes(h.beginTime);
    const e = parseTimeToMinutes(h.endTime);
    if (b === null || e === null) return false;
    return currentMinutes >= b && currentMinutes <= e;
  });
  if (ongoing) return ongoing;

  // 2. Break time before next lesson
  const nextHour = sorted.find((h, idx) => {
    const b = parseTimeToMinutes(h.beginTime);
    if (b === null) return false;
    const prevHour = idx > 0 ? sorted[idx - 1] : null;
    const prevEnd = prevHour ? parseTimeToMinutes(prevHour.endTime) : null;
    if (prevEnd !== null && currentMinutes > prevEnd && currentMinutes < b) {
      return true;
    }
    // Up to 20 minutes before this lesson even if no prevHour
    if (currentMinutes < b && b - currentMinutes <= 20) {
      return true;
    }
    return false;
  });
  if (nextHour) return nextHour;

  return undefined;
}

/**
 * Safely parse a date string or timestamp into milliseconds for chronological comparison.
 */
export function getMessageTimestamp(dateInput?: string | null): number {
  if (!dateInput) return 0;
  const t = new Date(dateInput).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Sorts an array of items by date descending (freshest / newest first).
 */
export function sortByDateDesc<T extends { date?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => getMessageTimestamp(b.date) - getMessageTimestamp(a.date));
}

/**
 * Calculates the ISO 8601 week number for a given Date.
 */
export function getIsoWeekNumber(d: Date = new Date()): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Determines whether a given date falls in an odd ('odd') or even ('even') week cycle.
 */
export function getWeekCycleParity(d: Date = new Date()): 'odd' | 'even' {
  return getIsoWeekNumber(d) % 2 === 1 ? 'odd' : 'even';
}

/**
 * Returns the Date of Monday for the relevant school week.
 * - On Monday–Friday (1..5), returns this week's Monday (adjusted by offsetWeeks).
 * - On Saturday (6) and Sunday (0), the current school week has ended, so it
 *   advances to NEXT week's Monday (adjusted by offsetWeeks).
 */
export function getRelevantSchoolWeekMonday(date: Date = getAppDate(), offsetWeeks: number = 0): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  // If Saturday (6), add 2 days to reach next Monday.
  // If Sunday (0), add 1 day to reach next Monday.
  // If Monday–Friday (1..5), subtract (day - 1) days to reach this Monday.
  const daysToMonday = day === 6 ? 2 : day === 0 ? 1 : -(day - 1);
  d.setDate(d.getDate() + daysToMonday + offsetWeeks * 7);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * Returns ISO date string (YYYY-MM-DD) for Monday of the relevant school week.
 */
export function getRelevantMondayIso(date: Date = getAppDate(), offsetWeeks: number = 0): string {
  const m = getRelevantSchoolWeekMonday(date, offsetWeeks);
  const year = m.getFullYear();
  const month = String(m.getMonth() + 1).padStart(2, '0');
  const day = String(m.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the Date of Monday for the current calendar week.
 */
export function getThisWeekMonday(date: Date = getAppDate()): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * Returns the Date of Monday for the next calendar week (+7 days from this week's Monday).
 */
export function getNextWeekMonday(date: Date = getAppDate()): Date {
  const d = getThisWeekMonday(date);
  d.setDate(d.getDate() + 7);
  return d;
}

/**
 * Returns ISO date string (YYYY-MM-DD) for next week's Monday.
 */
export function getNextWeekMondayIso(date: Date = getAppDate()): string {
  const m = getNextWeekMonday(date);
  const year = m.getFullYear();
  const month = String(m.getMonth() + 1).padStart(2, '0');
  const day = String(m.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

