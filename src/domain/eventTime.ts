import { getDayOfWeekName } from '../utils/dateUtils';
import type { Language } from '../i18n/translations';

const pad = (n: number) => String(n).padStart(2, '0');

const OFFSET_END = /(Z|[+-]\d{2}(?::?\d{2})?)$/i;

/** `+0100` and `+01` are not understood by every Date parser, `+01:00` is. */
function withColonOffset(value: string): string {
  return value.replace(/([+-])(\d{2})(\d{2})$/, '$1$2:$3').replace(/([+-]\d{2})$/, '$1:00');
}

/**
 * Time of day (HH:mm, device local time) from what the server sends for an event: a full date time or a bare time,
 * with or without a zone. A zone is converted to the device's time zone, seconds are dropped.
 * A bare time needs the event date to know which offset applies. '' when nothing usable is left.
 */
export function toLocalHm(value: unknown, date?: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';

  const full = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(text);
  const bare = /^\d{2}:\d{2}/.test(text);
  if (!full && !bare) return '';

  const hasZone = OFFSET_END.test(text.slice(bare ? 5 : 16));
  if (hasZone) {
    const iso = full ? text.replace(/\s/, 'T') : date ? `${date.split('T')[0]}T${text}` : '';
    const parsed = iso ? new Date(withColonOffset(iso)) : null;
    if (parsed && !isNaN(parsed.getTime())) return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  }
  return full ? text.slice(11, 16) : text.slice(0, 5);
}

/**
 * Display text of an event's time range, e.g. "10:00 – 10:45". Also cleans up values saved by older versions
 * that still carry seconds and the zone ("10:00:00+01:00 - 10:45:00+01:00").
 */
export function formatEventTime(time: string | undefined | null, date?: string): string {
  if (!time) return '';
  return time
    .split(/\s+[–-]\s+/)
    .map((part) => toLocalHm(part, date) || part.trim())
    .filter(Boolean)
    .join(' – ');
}

/** Start of the event's time range only, '' when it has none. */
export function formatEventStartTime(time: string | undefined | null, date?: string): string {
  return formatEventTime(time, date).split(' – ')[0];
}

/** "Po, 02. 11. 2026" – abbreviated weekday, then the zero padded date. Empty for an unreadable date. */
export function formatDateWithWeekday(date: string | undefined | null, lang?: Language): string {
  const match = (date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
  return `${getDayOfWeekName(weekday, lang, true)}, ${day}. ${month}. ${year}`;
}

/** Single day or a range ("Po, 02. 11. 2026 – Pá, 06. 11. 2026") of an event. */
export function formatEventDate(date: string, endDate?: string, lang?: Language): string {
  const start = formatDateWithWeekday(date, lang);
  const end = endDate && endDate !== date ? formatDateWithWeekday(endDate, lang) : '';
  return end ? `${start} – ${end}` : start;
}
