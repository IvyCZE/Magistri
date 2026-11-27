import type { SchoolEvent } from '../types/bakalari';

/**
 * Normalizes an event title by stripping common trailing day indicators like:
 * - " - 1. den", " – den 2", " (1. den)", " [den 3]", " (den 1/5)", " 1. část", " (1/5)"
 */
export function normalizeEventTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  return rawTitle
    .trim()
    .replace(/[\s–\-(]+(?:\d+\.?\s*den|den\s*\d+(?:\/\d+)?|\d+\.?\s*část)\s*\)?$/i, '')
    .replace(/[\s–\-(]+\d+\/\d+\s*\)?$/i, '')
    .trim();
}

/**
 * Calculates the difference in calendar days between two ISO date strings (dateB - dateA).
 */
export function getDayDifference(dateStrA: string, dateStrB: string): number {
  const cleanA = (dateStrA || '').split('T')[0];
  const cleanB = (dateStrB || '').split('T')[0];
  if (!cleanA || !cleanB) return 0;

  const a = new Date(cleanA + 'T00:00:00');
  const b = new Date(cleanB + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

/**
 * Determines if two dates are adjacent (consecutive or same day, or across a weekend).
 */
export function areDatesAdjacent(endA: string, startB: string): boolean {
  if (!endA || !startB) return false;
  const cleanA = endA.split('T')[0];
  const cleanB = startB.split('T')[0];

  const diff = getDayDifference(cleanA, cleanB);

  // Same day or directly consecutive calendar days
  if (diff >= 0 && diff <= 1) return true;

  // Across a weekend: Friday to Monday (diff 3), Friday to Sunday (diff 2), Saturday to Monday (diff 2)
  if (diff >= 2 && diff <= 3) {
    const dateA = new Date(cleanA + 'T00:00:00');
    const dateB = new Date(cleanB + 'T00:00:00');
    const dowA = dateA.getDay(); // 5 = Fri, 6 = Sat
    const dowB = dateB.getDay(); // 0 = Sun, 1 = Mon
    if ((dowA === 5 && (dowB === 0 || dowB === 1)) || (dowA === 6 && dowB === 1)) {
      return true;
    }
  }

  // Reverse overlap
  if (diff < 0 && Math.abs(diff) <= 1) return true;

  return false;
}

/**
 * Checks if an event is currently ongoing on the specified date .
 */
export function isEventOngoing(ev: SchoolEvent, currentDate: Date): boolean {
  if (!ev?.date) return false;
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const startStr = ev.date.split('T')[0];
  const endStr = (ev.endDate || ev.date).split('T')[0];

  return todayStr >= startStr && todayStr <= endStr;
}

/**
 * Groups consecutive daily event entries (e.g. multi-day school trips entered per day)
 * into a single unified event with startDate and endDate.
 */
export function groupConsecutiveEvents(events: SchoolEvent[], now: Date): SchoolEvent[] {
  if (!events || events.length === 0) return [];

  // Sort chronologically by start date
  const sorted = [...events].sort((a, b) => {
    const timeA = new Date(a.date.split('T')[0] + 'T00:00:00').getTime() || 0;
    const timeB = new Date(b.date.split('T')[0] + 'T00:00:00').getTime() || 0;
    return timeA - timeB;
  });

  const grouped: SchoolEvent[] = [];

  for (const ev of sorted) {
    const normTitle = normalizeEventTitle(ev.title);
    const normKey = normTitle.toLowerCase();

    // Look for an existing grouped event that matches title and whose date range is adjacent
    let foundGroup: SchoolEvent | undefined;

    for (const grp of grouped) {
      const grpNormTitle = normalizeEventTitle(grp.title);
      if (grpNormTitle.toLowerCase() === normKey) {
        const grpEnd = grp.endDate || grp.date;
        const grpStart = grp.date;
        const evStart = ev.date;
        const evEnd = ev.endDate || ev.date;

        if (areDatesAdjacent(grpEnd, evStart) || areDatesAdjacent(evEnd, grpStart)) {
          foundGroup = grp;
          break;
        }
      }
    }

    if (foundGroup) {
      // 1. Expand start date (earliest)
      if (ev.date < foundGroup.date) {
        foundGroup.date = ev.date;
      }
      // 2. Expand end date (latest)
      const candidateEnd = ev.endDate || ev.date;
      const currentEnd = foundGroup.endDate || foundGroup.date;
      if (candidateEnd > currentEnd) {
        foundGroup.endDate = candidateEnd;
      }
      // 3. Keep clean base title if current was stripped
      if (normTitle && normTitle.length < foundGroup.title.length) {
        foundGroup.title = normTitle;
      }
      // 4. Prefer longer / more detailed description
      if (!foundGroup.description || (ev.description && ev.description.length > foundGroup.description.length)) {
        foundGroup.description = ev.description;
      }
      // 5. Fallback location & organizer
      if (!foundGroup.location && ev.location) {
        foundGroup.location = ev.location;
      }
      if (!foundGroup.organizer && ev.organizer) {
        foundGroup.organizer = ev.organizer;
      }
      // 6. Time: keep initial start time
      if (!foundGroup.time && ev.time) {
        foundGroup.time = ev.time;
      }
      // 7. Update isPast: only true if final end date is in the past
      const finalEnd = foundGroup.endDate || foundGroup.date;
      const endDateTime = new Date(finalEnd.split('T')[0] + 'T23:59:59');
      foundGroup.isPast = endDateTime.getTime() < now.getTime();
    } else {
      // New group entry
      const finalEndDate = ev.endDate && ev.endDate !== ev.date ? ev.endDate : undefined;
      const newEv: SchoolEvent = {
        ...ev,
        title: normTitle || ev.title,
        endDate: finalEndDate,
      };

      const finalEnd = newEv.endDate || newEv.date;
      if (finalEnd) {
        const endDateTime = new Date(finalEnd.split('T')[0] + 'T23:59:59');
        newEv.isPast = endDateTime.getTime() < now.getTime();
      }
      grouped.push(newEv);
    }
  }

  return grouped;
}
