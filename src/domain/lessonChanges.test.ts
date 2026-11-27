import { describe, expect, it } from 'vitest';
import type { Lesson, TimetableDay } from '../types/bakalari';
import { getLessonChangeDetails } from './lessonChanges';

const original: Lesson = {
  id: 'lesson',
  hourId: 2,
  subjectId: 'math',
  subjectAbbrev: 'M',
  subjectName: 'Matematika',
  teacherName: 'Teacher A',
  teacherAbbrev: 'TA',
  roomId: 'room-a',
  roomAbbrev: '201',
  hasChange: false,
};
const day = { date: '2026-01-05', dayOfWeek: 1 };
const template: TimetableDay = { ...day, date: '', dayOfWeekName: 'Monday', atoms: [original] };

describe('getLessonChangeDetails', () => {
  it('uses the explicit destination from a room change and keeps the other fields neutral', () => {
    const lesson: Lesson = {
      ...original,
      hasChange: true,
      change: { changeType: 'RoomChanged', description: 'Změna učebny: 202' },
    };
    expect(getLessonChangeDetails(lesson)).toEqual({
      kind: 'room', room: '202', roomChanged: true, subjectChanged: false, teacherChanged: false,
    });
    expect(getLessonChangeDetails({
      ...lesson, roomAbbrev: 'VT-2', change: { changeType: 'RoomChanged', description: 'Přesun z učebny VT1 do VT2' },
    }).room).toBe('VT-2');
  });

  it('marks the substitute and only adds other tints when those values changed', () => {
    const lesson: Lesson = {
      ...original,
      hasChange: true,
      change: { changeType: 'Substitution', description: 'Suplování', substituteTeacher: 'Teacher B' },
    };
    expect(getLessonChangeDetails(lesson, day, [template])).toMatchObject({
      kind: 'substitution', roomChanged: false, subjectChanged: false, teacherChanged: true,
    });
    expect(getLessonChangeDetails({ ...lesson, subjectId: 'physics', roomAbbrev: '202' }, day, [template])).toMatchObject({
      roomChanged: true, subjectChanged: true, teacherChanged: true,
    });
    expect(getLessonChangeDetails({
      ...lesson, subjectId: 'physics', change: { changeType: 'Substitution', description: 'Suplování' },
    }, day, [template])).toMatchObject({ subjectChanged: true, teacherChanged: false });
  });

  it('leaves comparisons with ambiguous or mismatched permanent slots unhighlighted', () => {
    const lesson: Lesson = {
      ...original, subjectId: 'physics', group: 'A', hasChange: true,
      change: { changeType: 'Substitution', description: 'Suplování', substituteTeacher: 'Teacher B' },
    };
    const parallel: TimetableDay = {
      ...template, atoms: [{ ...original, group: 'A' }, { ...original, subjectId: 'other', group: 'A' }],
    };
    expect(getLessonChangeDetails(lesson, day, [template]).subjectChanged).toBe(false);
    expect(getLessonChangeDetails(lesson, day, [parallel]).subjectChanged).toBe(false);
  });

  it('keeps the substitution kind when a room change is also reported', () => {
    const change = { changeType: 'RoomChanged', typeName: 'Suplování', description: 'Změna učebny: 202' } as const;
    const details = getLessonChangeDetails({ ...original, hasChange: true, change }, day, [template]);
    expect(details).toMatchObject({ kind: 'substitution', room: '202', roomChanged: true, teacherChanged: false });
  });

  it('handles explicit subject changes, added lessons and cancellations', () => {
    for (const [change, kind, subjectChanged] of [
      [{ changeType: 'Substitution', typeName: 'Změna předmětu', description: '' }, 'subject', true],
      [{ changeType: 'Added', description: '' }, 'added', true],
      [{ changeType: 'Canceled', description: '' }, 'canceled', false],
    ] as const) {
      expect(getLessonChangeDetails({ ...original, change, hasChange: true })).toMatchObject({
        kind, subjectChanged, teacherChanged: false, roomChanged: false,
      });
    }
  });
});
