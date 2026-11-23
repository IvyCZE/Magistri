import type { TimetableData } from '../types/bakalari';
import { weekStart } from './absenceRecords';

/**
 * Monday (YYYY-MM-DD) of the week a timetable answer belongs to, taken from the dates of its days
 * (the first day with a date is enough, the answer is always one week). '' when no day has a date.
 */
export function mondayOfTimetable(timetable: Pick<TimetableData, 'days'> | null | undefined): string {
  for (const day of timetable?.days || []) {
    const date = typeof day?.date === 'string' ? day.date.split('T')[0] : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return weekStart(date);
  }
  return '';
}

const DAY_MS = 86400000;

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/**
 * Keeps the `keep` weeks closest to `anchorIso` (keys are Monday dates), so weeks the user only
 * browsed far away never push the current and the next week out of the saved cache.
 */
export function pruneWeeks<T>(weeks: Record<string, T>, keep: number, anchorIso: string): Record<string, T> {
  const anchor = dayNumber(anchorIso);
  const closest = Object.keys(weeks)
    .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .sort((a, b) => Math.abs(dayNumber(a) - anchor) - Math.abs(dayNumber(b) - anchor) || (a < b ? 1 : -1))
    .slice(0, keep);
  return Object.fromEntries(closest.map((key) => [key, weeks[key]]));
}
