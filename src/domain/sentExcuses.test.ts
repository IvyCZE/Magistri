import { describe, expect, it } from 'vitest';
import { excuseTarget, hourIdOfLesson, parseExcusePrefill } from './absenceRecords';
import { isCoveredByExcuse, lessonOfHourId, type SentExcuse } from './sentExcuses';

const hoursWithZeroth = [
  { id: 2, caption: '0' },
  { id: 3, caption: '1' },
  { id: 4, caption: '2' },
  { id: 7, caption: '5' },
  { id: 8, caption: '6' },
  { id: 9, caption: '7' },
];

const excuse = (over: Partial<SentExcuse> = {}): SentExcuse => ({
  dateFrom: '2026-11-10',
  dateTo: '2026-11-10',
  allDay: false,
  lessonFrom: 5,
  lessonTo: 7,
  ...over,
});

describe('lessonOfHourId', () => {
  it('turns the id of an hour into its lesson number and back', () => {
    expect(lessonOfHourId(hoursWithZeroth, 7)).toBe(5);
    expect(lessonOfHourId(hoursWithZeroth, 9)).toBe(7);
    expect(hourIdOfLesson(hoursWithZeroth, lessonOfHourId(hoursWithZeroth, 8))).toBe(8);
  });

  it('keeps the id when the hour is unknown', () => {
    expect(lessonOfHourId(hoursWithZeroth, 42)).toBe(42);
  });

  it('matches the lessons that the Omluvit button prefilled', () => {
    const params = new URLSearchParams(excuseTarget({ date: '2026-11-10', hourFrom: 5, hourTo: 7 }).split('?')[1]);
    const prefill = parseExcusePrefill(params)!;
    const sent = excuse({
      lessonFrom: lessonOfHourId(hoursWithZeroth, hourIdOfLesson(hoursWithZeroth, prefill.hourFrom!)),
      lessonTo: lessonOfHourId(hoursWithZeroth, hourIdOfLesson(hoursWithZeroth, prefill.hourTo!)),
    });
    expect(isCoveredByExcuse({ date: '2026-11-10', hourFrom: 5, hourTo: 7 }, [sent])).toBe(true);
  });
});

describe('isCoveredByExcuse', () => {
  it('covers the same day and lessons', () => {
    expect(isCoveredByExcuse({ date: '2026-11-10', hourFrom: 5, hourTo: 7 }, [excuse()])).toBe(true);
  });

  it('covers a record inside the excused lessons', () => {
    expect(isCoveredByExcuse({ date: '2026-11-10', hourFrom: 6, hourTo: 6 }, [excuse()])).toBe(true);
  });

  it('does not cover lessons outside the excused ones', () => {
    expect(isCoveredByExcuse({ date: '2026-11-10', hourFrom: 3, hourTo: 4 }, [excuse()])).toBe(false);
    expect(isCoveredByExcuse({ date: '2026-11-10', hourFrom: 5, hourTo: 8 }, [excuse()])).toBe(false);
  });

  it('does not cover another day', () => {
    expect(isCoveredByExcuse({ date: '2026-11-11', hourFrom: 5, hourTo: 7 }, [excuse()])).toBe(false);
  });

  it('covers every record of an all-day excuse, with or without known lessons', () => {
    const allDay = excuse({ allDay: true, lessonFrom: undefined, lessonTo: undefined });
    expect(isCoveredByExcuse({ date: '2026-11-10', hourFrom: 1, hourTo: 8 }, [allDay])).toBe(true);
    expect(isCoveredByExcuse({ date: '2026-11-10' }, [allDay])).toBe(true);
  });

  it('does not cover a record without lessons by an excuse of some lessons', () => {
    expect(isCoveredByExcuse({ date: '2026-11-10' }, [excuse()])).toBe(false);
  });

  it('applies the lessons only to the first and last day of several days', () => {
    const several = excuse({ dateFrom: '2026-11-09', dateTo: '2026-11-11', lessonFrom: 3, lessonTo: 5 });
    expect(isCoveredByExcuse({ date: '2026-11-09', hourFrom: 2, hourTo: 2 }, [several])).toBe(false);
    expect(isCoveredByExcuse({ date: '2026-11-09', hourFrom: 3, hourTo: 8 }, [several])).toBe(true);
    expect(isCoveredByExcuse({ date: '2026-11-10', hourFrom: 1, hourTo: 8 }, [several])).toBe(true);
    expect(isCoveredByExcuse({ date: '2026-11-10' }, [several])).toBe(true);
    expect(isCoveredByExcuse({ date: '2026-11-11', hourFrom: 1, hourTo: 5 }, [several])).toBe(true);
    expect(isCoveredByExcuse({ date: '2026-11-11', hourFrom: 5, hourTo: 6 }, [several])).toBe(false);
  });

  it('finds the matching excuse among several and handles none', () => {
    expect(isCoveredByExcuse({ date: '2026-11-10', hourFrom: 5, hourTo: 7 }, [])).toBe(false);
    expect(
      isCoveredByExcuse({ date: '2026-11-10', hourFrom: 5, hourTo: 7 }, [excuse({ dateFrom: '2026-10-01', dateTo: '2026-10-01' }), excuse()]),
    ).toBe(true);
  });
});
