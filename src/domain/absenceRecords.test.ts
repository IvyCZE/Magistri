import { describe, expect, it } from 'vitest';
import {
  absenceHoursLabel,
  buildAbsenceRecords,
  checkedDayHours,
  counterOf,
  excuseTarget,
  groupRecordsByWeek,
  hourIdOfLesson,
  hoursFromStudentTimetable,
  lessonsOfDay,
  parseExcusePrefill,
  resolveDayHours,
  weekStart,
} from './absenceRecords';

const day = (date: string, extra: Record<string, unknown>) => ({
  Date: `${date}T00:00:00+02:00`,
  Unsolved: 0,
  Ok: 0,
  Missed: 0,
  Late: 0,
  Soon: 0,
  School: 0,
  DistanceTeaching: 0,
  ...extra,
});

const subject = (SubjectName: string, extra: Record<string, number>) => ({
  SubjectName,
  LessonsCount: 20,
  Base: 0,
  Late: 0,
  Soon: 0,
  School: 0,
  DistanceTeaching: 0,
  ...extra,
});

const timetable = (date: string, lessons: Array<[number, string]>, changes: Record<number, string> = {}) => {
  const names = [...new Set(lessons.map(([, name]) => name))];
  return {
    Hours: lessons.map(([h]) => ({ Id: h + 2, Caption: String(h) })),
    Subjects: names.map((name, i) => ({ Id: `S${i}`, Name: name, Abbrev: name.slice(0, 3) })),
    Days: [
      {
        Date: `${date}T00:00:00+02:00`,
        Atoms: lessons.map(([h, name]) => ({
          HourId: h + 2,
          SubjectId: `S${names.indexOf(name)}`,
          Change: changes[h] ? { ChangeType: changes[h] } : null,
        })),
      },
    ],
  };
};

describe('weekStart', () => {
  it('returns the Monday of the week', () => {
    expect(weekStart('2026-10-15')).toBe('2026-10-12');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
  });
});

describe('counterOf', () => {
  it('reads a number or the length of a list', () => {
    expect(counterOf({ Ok: 3 }, ['Ok'])).toBe(3);
    expect(counterOf({ Ok: [5, 6] }, ['Ok'])).toBe(2);
    expect(counterOf({}, ['Ok'])).toBe(0);
  });
});

describe('lessonsOfDay', () => {
  it('lists the lessons of the date by hour number and skips cancelled ones', () => {
    const t = timetable('2026-10-15', [[1, 'Matematika'], [2, 'Anglický jazyk'], [3, 'Fyzika']], { 3: 'Canceled' });
    expect(lessonsOfDay(t, '2026-10-15').map((l) => [l.hour, l.subjectName])).toEqual([
      [1, 'Matematika'],
      [2, 'Anglický jazyk'],
    ]);
    expect(lessonsOfDay(t, '2026-10-16')).toEqual([]);
  });
});

describe('resolveDayHours', () => {
  const lessons = lessonsOfDay(
    timetable('2026-10-15', [[1, 'Matematika'], [2, 'Anglický jazyk'], [3, 'Anglický jazyk'], [6, 'Seminář'], [7, 'Seminář']]),
    '2026-10-15',
  );

  it('pins a subject whose lessons were all missed to its hours', () => {
    const hours = resolveDayHours(day('2026-10-15', { Ok: 2 }), [subject('Seminář', { Base: 2 })], lessons);
    expect(hours.Excused?.map((l) => l.hour)).toEqual([6, 7]);
  });

  it('pins a single late lesson', () => {
    const hours = resolveDayHours(day('2026-10-15', { Late: 1 }), [subject('Matematika', { Late: 1 })], lessons);
    expect(hours.Late?.map((l) => l.hour)).toEqual([1]);
  });

  it('leaves a subject unresolved when only some of its lessons were missed', () => {
    const hours = resolveDayHours(day('2026-10-15', { Missed: 1 }), [subject('Anglický jazyk', { Base: 1 })], lessons);
    expect(hours).toEqual({});
  });

  it('does not tell excused from unexcused when the day has both', () => {
    const hours = resolveDayHours(day('2026-10-15', { Ok: 1, Missed: 1 }), [subject('Matematika', { Base: 1 })], lessons);
    expect(hours).toEqual({});
  });

  it('does not trust a result that exceeds the counters', () => {
    const hours = resolveDayHours(day('2026-10-15', { Ok: 1 }), [subject('Seminář', { Base: 2 })], lessons);
    expect(hours).toEqual({});
  });

  it('leaves a subject with several kinds of absence unresolved', () => {
    const hours = resolveDayHours(day('2026-10-15', { Ok: 1, Late: 1 }), [subject('Seminář', { Base: 1, Late: 1 })], lessons);
    expect(hours).toEqual({});
  });
});

describe('hoursFromStudentTimetable', () => {
  // As in a real school: the hour definitions have ids 2.. for lessons 0.. (HourIndex is the id, not the lesson number).
  const defs = Array.from({ length: 11 }, (_, i) => ({ Id: i + 2, Caption: String(i), Start: 415 + i * 50 }));
  const lesson = (id: number, abbrev: string | null, AbsentType = 'NoAbsent', Minutes = 0) => ({
    HourIndex: id,
    Start: 415 + (id - 2) * 50,
    AbsentType,
    Minutes,
    Subject: abbrev ? { Id: abbrev, Abbrev: abbrev, Name: `${abbrev} name` } : null,
  });
  const doc = (date: string, Absences: unknown[]) => ({ Days: [{ Date: `${date}T00:00:00+01:00`, Absences }] });
  const hoursOf = (date: string, Absences: unknown[]) => hoursFromStudentTimetable(doc(date, Absences), defs).get(date)!;

  it('pins a late arrival to the second of two lessons of the same subject, by lesson number not hour id', () => {
    const raw = day('2026-11-05', { Late: 1 });
    const hours = hoursOf('2026-11-05', [
      lesson(7, 'NEJ'),
      lesson(8, 'SMAT'),
      lesson(9, 'SMAT', 'AbsentLate', 5),
      lesson(10, null),
    ]);
    expect(hours.Late?.map((l) => [l.hour, l.subjectAbbrev])).toEqual([[7, 'SMAT']]);
    const records = buildAbsenceRecords([raw], new Map([['2026-11-05', checkedDayHours(raw, hours)]]));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ type: 'Late', hourFrom: 7, hourTo: 7, hourLabel: '7. h', subjectAbbrev: 'SMAT' });
  });

  it('numbers the zeroth lesson 0 and falls back to the start time when the id is unknown', () => {
    const hours = hoursOf('2026-10-15', [
      lesson(2, 'A', 'AbsentOk'),
      { ...lesson(3, 'B', 'AbsentOk'), HourIndex: 99 },
    ]);
    expect(hours.Excused?.map((l) => l.hour)).toEqual([0, 1]);
  });

  it('works for a school without a zeroth lesson, whatever the ids are', () => {
    const noZero = [{ Id: 1, Caption: '1', Start: 470 }, { Id: 2, Caption: '2', Start: 520 }];
    const shifted = [{ Id: 40, Caption: '1', Start: 470 }, { Id: 41, Caption: '2', Start: 520 }];
    const absences = (a: number, b: number) => [
      { HourIndex: a, Start: 470, AbsentType: 'NoAbsent', Subject: null },
      { HourIndex: b, Start: 520, AbsentType: 'AbsentLate', Subject: null },
    ];
    for (const [hourDefs, ids] of [[noZero, [1, 2]], [shifted, [40, 41]]] as const) {
      const hours = hoursFromStudentTimetable(doc('2026-10-15', absences(ids[0], ids[1])), [...hourDefs]).get('2026-10-15')!;
      expect(hours.Late?.map((l) => l.hour)).toEqual([2]);
    }
  });

  it('leaves out lessons whose hour cannot be numbered', () => {
    const hours = hoursOf('2026-10-15', [{ ...lesson(3, 'A', 'AbsentOk'), HourIndex: 99, Start: 1 }]);
    expect(hours).toEqual({});
  });

  it('maps every absence type and sorts lessons by hour', () => {
    const hours = hoursOf('2026-10-15', [
      lesson(7, 'A', 'AbsentOk'),
      lesson(4, 'B', 'AbsentOk'),
      lesson(5, 'C', 'AbsentMiss'),
      lesson(6, 'D', 'Absent'),
      lesson(8, 'E', 'AbsentSoon'),
      lesson(9, 'F', 'AbsentSchool'),
      lesson(10, 'G', 'DistanceTeaching'),
      lesson(11, 'H', 'Whatever'),
    ]);
    expect(hours.Excused?.map((l) => l.hour)).toEqual([2, 5]);
    expect(hours.Unexcused?.map((l) => l.hour)).toEqual([3]);
    expect(hours.Unsolved?.map((l) => l.hour)).toEqual([4]);
    expect(hours.Soon?.map((l) => l.hour)).toEqual([6]);
    expect(hours.SchoolEvent?.map((l) => l.hour)).toEqual([7]);
    expect(hours.DistanceLearning?.map((l) => l.hour)).toEqual([8]);
  });

  it('gives days without absence empty hours and ignores a malformed answer', () => {
    expect(hoursOf('2026-10-24', [])).toEqual({});
    expect(hoursFromStudentTimetable(null, defs).size).toBe(0);
    expect(hoursFromStudentTimetable({ Days: 'x' }, defs).size).toBe(0);
  });

  it('does not trust a type that has more lessons than the day counter', () => {
    const raw = day('2026-10-15', { Ok: 1 });
    const hours = hoursOf('2026-10-15', [lesson(3, 'A', 'AbsentOk'), lesson(4, 'B', 'AbsentOk')]);
    expect(checkedDayHours(raw, hours)).toEqual({});
  });

  it('keeps the rest of the counter as plain count when fewer lessons are listed', () => {
    const raw = day('2026-10-15', { Ok: 3 });
    const hours = hoursOf('2026-10-15', [lesson(3, 'A', 'AbsentOk')]);
    const records = buildAbsenceRecords([raw], new Map([['2026-10-15', checkedDayHours(raw, hours)]]));
    expect(records.map((r) => [r.hourLabel, r.hoursCount])).toEqual([['1. h', 1], ['2 h', 2]]);
  });
});

describe('buildAbsenceRecords', () => {
  it('keeps plain counters when no hours are known', () => {
    const records = buildAbsenceRecords([day('2026-10-15', { Ok: 2, Late: 1 })]);
    expect(records.map((r) => [r.type, r.hoursCount, r.hourFrom, r.hourLabel])).toEqual([
      ['Excused', 2, undefined, '2 h'],
      ['Late', 1, undefined, '1×'],
    ]);
  });

  it('joins consecutive lessons into one record', () => {
    const lessons = lessonsOfDay(timetable('2026-10-15', [[6, 'Seminář'], [7, 'Seminář']]), '2026-10-15');
    const raw = day('2026-10-15', { Ok: 2 });
    const hours = resolveDayHours(raw, [subject('Seminář', { Base: 2 })], lessons);
    const records = buildAbsenceRecords([raw], new Map([['2026-10-15', hours]]));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ type: 'Excused', hourFrom: 6, hourTo: 7, hoursCount: 2, hourLabel: '6. - 7. h' });
  });

  it('splits lessons with a gap into separate records and keeps the unresolved rest', () => {
    const t = timetable('2026-09-18', [[1, 'Chemie'], [2, 'Český jazyk'], [3, 'Německý jazyk'], [4, 'Český jazyk'], [5, 'Anglický jazyk']]);
    const raw = day('2026-09-18', { Ok: 4, Late: 1 });
    const perSubject = [
      subject('Český jazyk', { Base: 2 }),
      subject('Německý jazyk', { Base: 1 }),
      subject('Anglický jazyk', { Base: 1 }),
    ];
    const hours = resolveDayHours(raw, perSubject, lessonsOfDay(t, '2026-09-18'));
    const records = buildAbsenceRecords([raw], new Map([['2026-09-18', hours]]));
    expect(records.map((r) => [r.type, r.hourLabel])).toEqual([
      ['Excused', '2. - 5. h'],
      ['Late', '1×'],
    ]);

    const gap = lessonsOfDay(t, '2026-09-18').filter((l) => l.hour !== 3);
    const gapRaw = day('2026-09-18', { Ok: 3 });
    const gapHours = resolveDayHours(gapRaw, [subject('Český jazyk', { Base: 2 }), subject('Anglický jazyk', { Base: 1 })], gap);
    const gapRecords = buildAbsenceRecords([gapRaw], new Map([['2026-09-18', gapHours]]));
    expect(gapRecords.map((r) => r.hourLabel)).toEqual(['2. h', '4. - 5. h']);
  });

  it('counts lesson zero', () => {
    const raw = day('2026-10-15', { Missed: 1 });
    const lessons = lessonsOfDay(timetable('2026-10-15', [[0, 'Matematika'], [1, 'Fyzika']]), '2026-10-15');
    const hours = resolveDayHours(raw, [subject('Matematika', { Base: 1 })], lessons);
    expect(buildAbsenceRecords([raw], new Map([['2026-10-15', hours]]))[0]).toMatchObject({ hourFrom: 0, hourLabel: '0. h' });
  });

  it('puts the newest day first and lessons of a day in school order', () => {
    const records = buildAbsenceRecords([day('2026-10-05', { Late: 1 }), day('2026-10-22', { Ok: 1 })]);
    expect(records.map((r) => r.date)).toEqual(['2026-10-22', '2026-10-05']);
  });
});

describe('absenceHoursLabel', () => {
  it('formats single lessons, ranges and counters', () => {
    expect(absenceHoursLabel({ hourFrom: 3, hourTo: 3, hoursCount: 1, type: 'Late' })).toBe('3. h');
    expect(absenceHoursLabel({ hourFrom: 2, hourTo: 4, hoursCount: 3, type: 'Excused' })).toBe('2. - 4. h');
    expect(absenceHoursLabel({ hoursCount: 3, type: 'Excused' })).toBe('3 h');
    expect(absenceHoursLabel({ hoursCount: 2, type: 'Late' })).toBe('2×');
  });
});

describe('excuse link', () => {
  it('round-trips a record with lessons', () => {
    const target = excuseTarget({ date: '2026-10-22', hourFrom: 1, hourTo: 2 });
    const params = new URLSearchParams(target.split('?')[1]);
    expect(target.startsWith('new-message?')).toBe(true);
    expect(parseExcusePrefill(params)).toEqual({ date: '2026-10-22', hourFrom: 1, hourTo: 2 });
  });

  it('works without lessons and ignores other links', () => {
    expect(parseExcusePrefill(new URLSearchParams(excuseTarget({ date: '2026-10-22' }).split('?')[1]))).toEqual({
      date: '2026-10-22',
      hourFrom: undefined,
      hourTo: undefined,
    });
    expect(parseExcusePrefill(new URLSearchParams('draftId=1'))).toBeNull();
    expect(parseExcusePrefill(new URLSearchParams('excuse=1&date=bad'))).toBeNull();
    expect(parseExcusePrefill(null)).toBeNull();
  });
});

describe('excuse form hours', () => {
  // A school with a 0th lesson: the id of an hour is two more than its caption.
  const withZeroth = Array.from({ length: 9 }, (_, i) => ({ id: i + 2, caption: String(i) }));
  const withoutZeroth = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, caption: String(i + 1) }));

  it('turns a lesson number into the id the pickers use', () => {
    expect(hourIdOfLesson(withZeroth, 5)).toBe(7);
    expect(hourIdOfLesson(withZeroth, 7)).toBe(9);
    expect(hourIdOfLesson(withZeroth, 0)).toBe(2);
    expect(hourIdOfLesson(withoutZeroth, 5)).toBe(5);
  });

  it('keeps the number when no hour has that caption', () => {
    expect(hourIdOfLesson(withZeroth, 12)).toBe(12);
    expect(hourIdOfLesson([], 5)).toBe(5);
  });

  it('shows lessons 5-7 of an absence as 5-7 in the form, not as 3-5', () => {
    const params = new URLSearchParams(excuseTarget({ date: '2026-11-10', hourFrom: 5, hourTo: 7 }).split('?')[1]);
    const prefill = parseExcusePrefill(params)!;
    const captionOf = (id: number) => withZeroth.find((h) => h.id === id)!.caption;
    expect(captionOf(hourIdOfLesson(withZeroth, prefill.hourFrom!))).toBe('5');
    expect(captionOf(hourIdOfLesson(withZeroth, prefill.hourTo!))).toBe('7');
  });
});

describe('groupRecordsByWeek', () => {
  const rec = (date: string, id = date) => ({ id, date, type: 'Late', hoursCount: 1, lessonHour: 1 }) as Parameters<typeof groupRecordsByWeek>[0][number];

  it('groups by Monday-Friday week, newest first, without empty weeks', () => {
    const weeks = groupRecordsByWeek([rec('2026-11-05', 'a'), rec('2026-11-03', 'b'), rec('2026-10-22', 'c')]);
    expect(weeks.map((w) => [w.start, w.end, w.records.map((r) => r.id)])).toEqual([
      ['2026-11-02', '2026-11-06', ['a', 'b']],
      ['2026-10-19', '2026-10-23', ['c']],
    ]);
  });

  it('extends a week to Sunday when a record is on the weekend and keeps undated records last', () => {
    const weeks = groupRecordsByWeek([rec('2026-11-07'), rec(''), rec('2026-11-02')]);
    expect(weeks.map((w) => [w.start, w.end])).toEqual([['2026-11-02', '2026-11-08'], ['', '']]);
  });

  it('spans a change of month and year', () => {
    expect(groupRecordsByWeek([rec('2026-12-31')])[0]).toMatchObject({ start: '2026-12-28', end: '2027-01-01' });
  });
});
