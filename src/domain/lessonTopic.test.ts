import { describe, expect, it } from 'vitest';
import type { Lesson, TeachingTopic, TimetableDay, TimetableHour } from '../types/bakalari';
import { findLessonTopic } from './lessonTopic';

const lesson: Lesson = {
  id: 'first',
  hourId: 2,
  subjectId: 'math',
  subjectAbbrev: 'M',
  subjectName: 'Matematika',
  teacherName: 'Teacher A',
  teacherAbbrev: 'TA',
  roomId: '',
  roomAbbrev: '',
  hasChange: false,
};
const hour: TimetableHour = { id: 2, caption: '0', beginTime: '07:00', endTime: '07:45' };
const day: TimetableDay = { date: '2026-01-05', dayOfWeek: 1, dayOfWeekName: 'Monday', atoms: [lesson] };
const topic: TeachingTopic = {
  id: 'topic',
  date: day.date,
  hour: '0. hodina',
  period: '0. hodina',
  subjectId: 'math',
  subjectAbbrev: 'M',
  subjectName: 'Matematika',
  topic: 'Geometry',
};

describe('findLessonTopic', () => {
  it('prefers the current timetable entry and skips undated permanent lessons', () => {
    expect(findLessonTopic({ ...lesson, theme: ' Triangles ' }, hour, day, [topic])).toBe('Triangles');
    expect(findLessonTopic({ ...lesson, theme: 'Triangles' }, hour, { ...day, date: '' }, [topic])).toBeUndefined();
  });

  it('matches by displayed period, subject and date even when the period ID is different', () => {
    expect(findLessonTopic(lesson, hour, day, [
      { ...topic, period: 'Period 2', topic: 'Wrong period' },
      { ...topic, date: '2026-01-06', topic: 'Wrong date' },
      { ...topic, subjectId: 'science', topic: 'Wrong subject' },
      topic,
    ])).toBe('Geometry');
    expect(findLessonTopic(lesson, hour, day, [{ ...topic, period: '2' }])).toBeUndefined();
  });

  it('uses older records without a period only for a single lesson of that subject', () => {
    const legacy = { ...topic, period: undefined, hour: '0. hodina', lessonLabel: '0' };
    const repeated = { ...day, atoms: [lesson, { ...lesson, id: 'second', hourId: 3 }] };
    expect(findLessonTopic(lesson, hour, day, [legacy])).toBe('Geometry');
    expect(findLessonTopic(lesson, hour, repeated, [legacy])).toBeUndefined();
    expect(findLessonTopic(lesson, hour, repeated, [legacy, topic])).toBe('Geometry');
  });

  it('uses the selected teacher to disambiguate parallel lessons', () => {
    const parallel = { ...day, atoms: [lesson, { ...lesson, id: 'other', teacherName: 'Teacher B' }] };
    expect(findLessonTopic(lesson, hour, parallel, [topic])).toBeUndefined();
    expect(findLessonTopic(lesson, hour, parallel, [
      { ...topic, teacher: 'Teacher B', topic: 'Algebra' },
      { ...topic, teacher: 'Teacher A' },
    ])).toBe('Geometry');
  });
});
