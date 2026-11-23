/** The age is only shown once the data is older than this. */
export const STALE_AFTER_MS = 16 * 60 * 1000;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Short age of the last successful refresh ("17min", "2h", "1d"), rounded down.
 * Empty while the data is fresh (up to 16 minutes) or when there was no refresh at all (`lastUpdated` 0).
 */
export function formatDataAge(lastUpdated: number, now: number): string {
  if (!lastUpdated || lastUpdated > now) return '';
  const age = now - lastUpdated;
  if (age <= STALE_AFTER_MS) return '';
  if (age < HOUR) return `${Math.floor(age / MINUTE)}min`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h`;
  return `${Math.floor(age / DAY)}d`;
}
