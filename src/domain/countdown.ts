import type { TimetableData, TimetableDay, TimetableHour, Lesson } from '../types/bakalari';
import type { Language } from '../i18n/translations';
import { getHolidayInfo } from './holiday';
import { parseTimeToMinutes, toIsoDate } from './time';

export type CountdownMode = 'lesson_time' | 'day_time' | 'lesson_percent' | 'day_percent';

export type CountdownState =
  | 'weekend_or_free'
  | 'school_over'
  | 'before_school'
  | 'break'
  | 'in_lesson'
  | 'day_time'
  | 'day_percent';

/** Translation keys the UI maps to text. `holiday` means `holidayLabel` is shown instead. */
export type CountdownLabelKey =
  | 'weekendFree'
  | 'dayOff'
  | 'holiday'
  | 'schoolEnds'
  | 'schoolStarts'
  | 'lessonStarts'
  | 'lessonEnds'
  | 'breakEnds';

export interface CountdownResult {
  state: CountdownState;
  labelKey: CountdownLabelKey;
  holidayLabel?: string;
  counterValue: string;
  /** 0..1 */
  progress: number;
  /** Absolute epoch ms of the phase being counted down; null when nothing is running. */
  phaseStartMs: number | null;
  phaseEndMs: number | null;
}

export interface CountdownInput {
  now: Date;
  actual: TimetableData;
  permanent: TimetableData;
  mode: CountdownMode;
  hideDecimals: boolean;
  lang: Language;
}

interface ScheduledLesson {
  atom: Lesson;
  hour: TimetableHour;
}

const hasAtoms = (d: any) => (d?.atoms?.length || 0) > 0;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Today's lessons, sorted by start time, with their hour definitions. */
export function resolveTodayLessons(now: Date, actual: TimetableData, permanent: TimetableData, lang: Language) {
  const todayJs = now.getDay();
  const isWeekend = todayJs === 0 || todayJs === 6;
  const todayIso = toIsoDate(now);
  const hours = actual.hours?.length ? actual.hours : permanent.hours;

  let todayDay: TimetableDay | undefined;
  let holidayDay: TimetableDay | undefined;
  let hoursList = hours;
  if (!isWeekend) {
    let day = actual.days.find((d) => (d.date ? d.date.slice(0, 10) === todayIso : d.dayOfWeek === todayJs));
    const todayHoliday = getHolidayInfo(day || todayIso, lang);
    let perm = false;
    if (!todayHoliday.isHoliday && (!day || !hasAtoms(day))) {
      const pDay = permanent.days.find((d) => d.dayOfWeek === todayJs);
      if (pDay && hasAtoms(pDay)) {
        day = pDay;
        perm = true;
      }
    }
    holidayDay = day;
    todayDay = day && hasAtoms(day) ? day : undefined;
    hoursList = perm ? permanent.hours : hours;
  }

  let lessons: ScheduledLesson[] = [];
  if (todayDay?.atoms && hoursList?.length) {
    lessons = [...todayDay.atoms]
      .map((atom) => ({ atom, hour: hoursList.find((hour) => Number(hour.id) === Number(atom.hourId)) }))
      .filter((item): item is ScheduledLesson => Boolean(item.hour))
      .sort((a, b) => (parseTimeToMinutes(a.hour.beginTime) ?? 0) - (parseTimeToMinutes(b.hour.beginTime) ?? 0));
  }
  return { isWeekend, todayDay, holidayDay, todayIso, lessons };
}

function formatPercent(ratio: number, hideDecimals: boolean): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  return hideDecimals ? `${Math.round(clamped * 100)} %` : `${(clamped * 100).toFixed(2)} %`;
}

function formatHms(totalSecs: number): string {
  const hh = Math.floor(totalSecs / 3600);
  const mm = Math.floor((totalSecs % 3600) / 60);
  const ss = Math.floor(totalSecs % 60);
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

function formatMs(totalSecs: number): string {
  return `${pad2(Math.floor(totalSecs / 60))}:${pad2(Math.floor(totalSecs % 60))}`;
}

/**
 * The state of the school day at `now`, and the text and progress the countdown
 * shows for the chosen mode.
 */
export function computeCountdown(input: CountdownInput): CountdownResult {
  const { now, mode, hideDecimals, lang } = input;
  const { isWeekend, holidayDay, todayIso, lessons } = resolveTodayLessons(now, input.actual, input.permanent, lang);
  const isPercentMode = mode === 'lesson_percent' || mode === 'day_percent';
  const midnightMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const abs = (secs: number) => midnightMs + secs * 1000;

  // Weekend, or a day without lessons
  if (isWeekend || !lessons.length) {
    const holiday = getHolidayInfo(holidayDay || todayIso, lang);
    const isHoliday = !isWeekend && holiday.isHoliday;
    return {
      state: 'weekend_or_free',
      labelKey: isWeekend ? 'weekendFree' : isHoliday ? 'holiday' : 'dayOff',
      holidayLabel: isHoliday ? (holiday.title || holiday.badgeLabel) : undefined,
      counterValue: isPercentMode ? (hideDecimals ? '100 %' : '100.00 %') : (mode === 'day_time' ? '00:00:00' : '00:00'),
      progress: 1,
      phaseStartMs: null,
      phaseEndMs: null,
    };
  }

  const firstItem = lessons[0];
  const lastItem = lessons[lessons.length - 1];
  const firstBeginSecs = (parseTimeToMinutes(firstItem.hour.beginTime) ?? (8 * 60)) * 60;
  const lastEndSecs = (parseTimeToMinutes(lastItem.hour.endTime) ?? (14 * 60 + 25)) * 60;
  const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;

  // School is over for the day
  if (nowSecs >= lastEndSecs) {
    return {
      state: 'school_over',
      labelKey: 'schoolEnds',
      counterValue: isPercentMode ? (hideDecimals ? '100 %' : '100.00 %') : (mode === 'day_time' ? '00:00:00' : '00:00'),
      progress: 1,
      phaseStartMs: null,
      phaseEndMs: null,
    };
  }

  // Before school starts
  if (nowSecs < firstBeginSecs) {
    const remaining = Math.max(0, firstBeginSecs - nowSecs);
    let counter: string;
    if (mode === 'lesson_time') {
      counter = remaining >= 3600 ? formatHms(remaining) : formatMs(remaining);
    } else if (mode === 'day_time') {
      counter = formatHms(remaining);
    } else {
      counter = hideDecimals ? '0 %' : '0.00 %';
    }
    return {
      state: 'before_school',
      labelKey: mode === 'day_time' || mode === 'day_percent' ? 'schoolStarts' : 'lessonStarts',
      counterValue: counter,
      progress: 0,
      phaseStartMs: null,
      phaseEndMs: abs(firstBeginSecs),
    };
  }

  // During the school day
  const totalDaySecs = Math.max(1, lastEndSecs - firstBeginSecs);
  const dayProgress = Math.max(0, Math.min(1, Math.max(0, nowSecs - firstBeginSecs) / totalDaySecs));
  const remainingDaySecs = Math.max(0, lastEndSecs - nowSecs);

  let active: ScheduledLesson | null = null;
  let isBreak = false;
  let breakTargetBeginSecs = 0;
  let breakPrevEndSecs = 0;

  for (let i = 0; i < lessons.length; i++) {
    const item = lessons[i];
    const bSecs = (parseTimeToMinutes(item.hour.beginTime) ?? 0) * 60;
    const eSecs = (parseTimeToMinutes(item.hour.endTime) ?? 0) * 60;
    if (nowSecs >= bSecs && nowSecs <= eSecs) {
      active = item;
      break;
    }
    if (nowSecs < bSecs) {
      isBreak = true;
      breakTargetBeginSecs = bSecs;
      const prev = lessons[i - 1];
      breakPrevEndSecs = prev ? (parseTimeToMinutes(prev.hour.endTime) ?? 0) * 60 : bSecs - 600;
      break;
    }
  }

  let lessonProgress = 0;
  let remainingLessonSecs = 0;
  let phaseStartSecs = 0;
  let phaseEndSecs = 0;
  if (active) {
    phaseStartSecs = (parseTimeToMinutes(active.hour.beginTime) ?? 0) * 60;
    phaseEndSecs = (parseTimeToMinutes(active.hour.endTime) ?? 0) * 60;
    const total = Math.max(1, phaseEndSecs - phaseStartSecs);
    remainingLessonSecs = Math.max(0, phaseEndSecs - nowSecs);
    lessonProgress = Math.max(0, Math.min(1, Math.max(0, nowSecs - phaseStartSecs) / total));
  } else if (isBreak) {
    phaseStartSecs = breakPrevEndSecs;
    phaseEndSecs = breakTargetBeginSecs;
    const total = Math.max(1, phaseEndSecs - phaseStartSecs);
    remainingLessonSecs = Math.max(0, phaseEndSecs - nowSecs);
    lessonProgress = Math.max(0, Math.min(1, Math.max(0, nowSecs - phaseStartSecs) / total));
  }

  const lessonState: CountdownState = isBreak ? 'break' : 'in_lesson';
  const lessonLabel: CountdownLabelKey = isBreak ? 'breakEnds' : 'lessonEnds';

  if (mode === 'lesson_time') {
    return {
      state: lessonState, labelKey: lessonLabel, counterValue: formatMs(remainingLessonSecs), progress: lessonProgress,
      phaseStartMs: abs(phaseStartSecs), phaseEndMs: abs(phaseEndSecs),
    };
  }
  if (mode === 'day_time') {
    return {
      state: 'day_time', labelKey: 'schoolEnds', counterValue: formatHms(remainingDaySecs), progress: dayProgress,
      phaseStartMs: abs(firstBeginSecs), phaseEndMs: abs(lastEndSecs),
    };
  }
  if (mode === 'lesson_percent') {
    return {
      state: lessonState, labelKey: lessonLabel, counterValue: formatPercent(lessonProgress, hideDecimals), progress: lessonProgress,
      phaseStartMs: abs(phaseStartSecs), phaseEndMs: abs(phaseEndSecs),
    };
  }
  return {
    state: 'day_percent', labelKey: 'schoolEnds', counterValue: formatPercent(dayProgress, hideDecimals), progress: dayProgress,
    phaseStartMs: abs(firstBeginSecs), phaseEndMs: abs(lastEndSecs),
  };
}
