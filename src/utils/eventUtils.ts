import type { SchoolEvent } from '../types/bakalari';
import { getAppDate } from './dateUtils';
import {
  areDatesAdjacent,
  getDayDifference,
  groupConsecutiveEvents as groupEvents,
  isEventOngoing as isOngoing,
  normalizeEventTitle,
} from '../domain/eventGrouping';

export { areDatesAdjacent, getDayDifference, normalizeEventTitle };

/** Checks if an event is ongoing on the given date (defaults to the app date). */
export function isEventOngoing(ev: SchoolEvent, currentDate: Date = getAppDate()): boolean {
  return isOngoing(ev, currentDate);
}

/** Groups consecutive daily entries of one event. See `domain/eventGrouping.ts`. */
export function groupConsecutiveEvents(events: SchoolEvent[]): SchoolEvent[] {
  return groupEvents(events, getAppDate());
}
