import { describe, expect, it } from 'vitest';
import { formatDateWithWeekday, formatEventDate, formatEventStartTime, formatEventTime, toLocalHm } from './eventTime';

const localHm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

describe('toLocalHm', () => {
  it('drops seconds when there is no zone', () => {
    expect(toLocalHm('2026-11-11T10:00:00')).toBe('10:00');
    expect(toLocalHm('10:45:00')).toBe('10:45');
    expect(toLocalHm('08:05')).toBe('08:05');
  });

  it('converts a full date time with a zone to the device time zone', () => {
    expect(toLocalHm('2026-11-11T10:00:00+01:00')).toBe(localHm('2026-11-11T10:00:00+01:00'));
    expect(toLocalHm('2026-11-11T09:00:00Z')).toBe(localHm('2026-11-11T09:00:00Z'));
    expect(toLocalHm('2026-11-11T10:00:00+0100')).toBe(localHm('2026-11-11T10:00:00+01:00'));
  });

  it('converts a bare time with a zone using the event date', () => {
    expect(toLocalHm('10:00:00+01:00', '2026-11-11')).toBe(localHm('2026-11-11T10:00:00+01:00'));
    expect(toLocalHm('10:00:00+01:00', '2026-07-11T00:00:00')).toBe(localHm('2026-07-11T10:00:00+01:00'));
  });

  it('falls back to the written time when a zoned bare time has no date', () => {
    expect(toLocalHm('10:00:00+01:00')).toBe('10:00');
  });

  it('returns empty text for anything that is not a time', () => {
    expect(toLocalHm(undefined)).toBe('');
    expect(toLocalHm('')).toBe('');
    expect(toLocalHm('celý den')).toBe('');
  });
});

describe('formatEventTime', () => {
  it('cleans up values saved with seconds and zone', () => {
    const out = formatEventTime('10:00:00+01:00 – 10:45:00+01:00', '2026-11-11');
    expect(out).toBe(`${localHm('2026-11-11T10:00:00+01:00')} – ${localHm('2026-11-11T10:45:00+01:00')}`);
    expect(out).not.toMatch(/:\d{2}:|\+/);
  });

  it('keeps clean values and accepts a hyphen as separator', () => {
    expect(formatEventTime('08:00 – 08:45')).toBe('08:00 – 08:45');
    expect(formatEventTime('08:00 - 08:45')).toBe('08:00 – 08:45');
    expect(formatEventTime('')).toBe('');
  });

  it('gives only the start for the home widget', () => {
    expect(formatEventStartTime('08:00 – 08:45')).toBe('08:00');
    expect(formatEventStartTime(undefined)).toBe('');
  });
});

describe('event dates', () => {
  it('puts the weekday abbreviation before a zero padded date', () => {
    expect(formatDateWithWeekday('2026-11-11', 'cs')).toBe('St, 11. 11. 2026');
    expect(formatDateWithWeekday('2026-11-02T00:00:00', 'cs')).toBe('Po, 02. 11. 2026');
    expect(formatDateWithWeekday('2026-11-08', 'cs')).toBe('Ne, 08. 11. 2026');
    expect(formatDateWithWeekday('2026-11-11', 'en')).toBe('Wed, 11. 11. 2026');
    expect(formatDateWithWeekday('', 'cs')).toBe('');
  });

  it('formats ranges with both ends', () => {
    expect(formatEventDate('2026-11-02', '2026-11-06', 'cs')).toBe('Po, 02. 11. 2026 – Pá, 06. 11. 2026');
    expect(formatEventDate('2026-11-02', '2026-11-02', 'cs')).toBe('Po, 02. 11. 2026');
    expect(formatEventDate('2026-11-02', undefined, 'cs')).toBe('Po, 02. 11. 2026');
  });
});
