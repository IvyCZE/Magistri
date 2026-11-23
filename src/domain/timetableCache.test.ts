import { describe, expect, it } from 'vitest';
import type { TimetableData } from '../types/bakalari';
import { mondayOfTimetable, pruneWeeks } from './timetableCache';

const day = (date: string) => ({ date, dayOfWeek: 1, dayOfWeekName: '', atoms: [] }) as unknown as TimetableData['days'][number];

describe('mondayOfTimetable', () => {
  it('returns the Monday of the week of the first dated day', () => {
    expect(mondayOfTimetable({ days: [day('2026-11-05T00:00:00+01:00')] })).toBe('2026-11-02');
    expect(mondayOfTimetable({ days: [day('2026-11-02')] })).toBe('2026-11-02');
  });

  it('skips undated days and returns empty string without any date', () => {
    expect(mondayOfTimetable({ days: [day(''), day('2026-11-04')] })).toBe('2026-11-02');
    expect(mondayOfTimetable({ days: [day('')] })).toBe('');
    expect(mondayOfTimetable(null)).toBe('');
  });
});

describe('pruneWeeks', () => {
  const weeks = {
    '2026-09-07': 'a',
    '2026-10-26': 'b',
    '2026-11-02': 'c',
    '2026-11-09': 'd',
    '2027-03-01': 'e',
  };

  it('keeps the weeks closest to the anchor', () => {
    expect(Object.keys(pruneWeeks(weeks, 3, '2026-11-02')).sort()).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
  });

  it('keeps everything when under the limit', () => {
    expect(Object.keys(pruneWeeks(weeks, 10, '2026-11-02'))).toHaveLength(5);
  });

  it('drops invalid keys', () => {
    expect(pruneWeeks({ actual: 1, '2026-11-02': 2 }, 5, '2026-11-02')).toEqual({ '2026-11-02': 2 });
  });
});
