import type { SchoolEvent } from '../types/bakalari';
import { getAppDate, getAppLanguage } from './dateUtils';
import type { Language } from '../i18n/translations';
import {
  areDatesAdjacent,
  getDayDifference,
  getEventDurationDays,
  groupConsecutiveEvents as groupEvents,
  isEventOngoing as isOngoing,
  normalizeEventTitle,
} from '../domain/eventGrouping';

export { areDatesAdjacent, getDayDifference, getEventDurationDays, normalizeEventTitle };

/**
 * Returns formatted duration string according to language.
 * Czech: "1 den", "2 dny", "5 dní".
 * English: "1 day", "2 days", "5 days".
 */
export function formatEventDuration(days: number, lang?: Language): string {
  const activeLang = lang || getAppLanguage();
  if (activeLang === 'en') {
    return days <= 1 ? '1 day' : `${days} days`;
  }
  if (days <= 1) return '1 den';
  if (days >= 2 && days <= 4) return `${days} dny`;
  return `${days} dní`;
}

/** Checks if an event is ongoing on the given date (defaults to the app date). */
export function isEventOngoing(ev: SchoolEvent, currentDate: Date = getAppDate()): boolean {
  return isOngoing(ev, currentDate);
}

/** Groups consecutive daily entries of one event. See `domain/eventGrouping.ts`. */
export function groupConsecutiveEvents(events: SchoolEvent[]): SchoolEvent[] {
  return groupEvents(events, getAppDate());
}
