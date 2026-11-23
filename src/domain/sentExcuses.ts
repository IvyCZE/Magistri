import type { AbsenceRecord } from '../types/bakalari';

/**
 * An excuse note sent from this app. The server's list of sent messages carries neither the days nor the
 * lessons of the excuse, so they are remembered here, as lesson numbers (the same unit as an absence record).
 */
export interface SentExcuse {
  dateFrom: string;
  dateTo: string;
  allDay: boolean;
  lessonFrom?: number;
  lessonTo?: number;
}

export const SENT_EXCUSES_KEY = 'b_sent_excuses';
const MAX_REMEMBERED = 200;

/** Lesson number (the caption) of an hour definition id, the inverse of `hourIdOfLesson`. */
export function lessonOfHourId(hours: readonly { id: number; caption: string }[], id: number): number {
  const hour = hours.find((h) => h.id === id);
  const lesson = hour ? parseInt(hour.caption, 10) : NaN;
  return Number.isNaN(lesson) ? id : lesson;
}

/** True when a sent excuse covers the days and lessons of the record. */
export function isCoveredByExcuse(
  rec: Pick<AbsenceRecord, 'date' | 'hourFrom' | 'hourTo'>,
  excuses: readonly SentExcuse[],
): boolean {
  if (!rec.date) return false;
  return excuses.some((ex) => {
    if (rec.date < ex.dateFrom || rec.date > ex.dateTo) return false;
    if (ex.allDay) return true;
    const strictlyInside = rec.date > ex.dateFrom && rec.date < ex.dateTo;
    if (strictlyInside) return true;
    if (rec.hourFrom == null || ex.lessonFrom == null || ex.lessonTo == null) return false;
    const recTo = rec.hourTo ?? rec.hourFrom;
    const startsInTime = rec.date !== ex.dateFrom || rec.hourFrom >= ex.lessonFrom;
    const endsInTime = rec.date !== ex.dateTo || recTo <= ex.lessonTo;
    return startsInTime && endsInTime;
  });
}

export function loadSentExcuses(): SentExcuse[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SENT_EXCUSES_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.dateFrom === 'string' && typeof e.dateTo === 'string' && typeof e.allDay === 'boolean',
    );
  } catch {
    return [];
  }
}

export function rememberSentExcuse(excuse: SentExcuse): void {
  try {
    const next = [excuse, ...loadSentExcuses()].slice(0, MAX_REMEMBERED);
    localStorage.setItem(SENT_EXCUSES_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable: the button simply stays, nothing else depends on this.
  }
}
