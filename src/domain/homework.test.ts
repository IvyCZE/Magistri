import { expect, it } from 'vitest';
import type { Homework } from '../types/bakalari';
import { homeworkStatus, homeworkWeeks } from './homework';

const task = (deadline: string, changes: Partial<Homework> = {}): Homework => ({
  id: deadline,
  subjectId: '',
  subjectName: '',
  subjectAbbrev: '',
  teacherName: '',
  content: '',
  date: '2026-09-01',
  deadline,
  done: false,
  ...changes,
});

it('keeps the due day active and puts closed or checked tasks in the same tab', () => {
  const today = '2026-11-23';
  const overdue = task('2026-11-22');
  const closed = { ...overdue, closed: true };
  expect(homeworkStatus(task(today), today)).toBe('active');
  expect(homeworkStatus(task('2026-11-25'), today)).toBe('active');
  expect(homeworkStatus(task(''), today)).toBe('active');
  expect(homeworkStatus(overdue, today)).toBe('overdue');
  expect(homeworkStatus(closed, today)).toBe('closed');
  expect(homeworkStatus(task('2026-11-25', { closed: true }), today)).toBe('closed');
  expect(homeworkStatus({ ...overdue, done: true }, today)).toBe('closed');
  expect(homeworkStatus({ ...closed, done: true }, today)).toBe('closed');
});

it('groups by deadline with upcoming weeks first for active tasks and recent weeks first for history', () => {
  const early = task('2026-11-24');
  const weekend = task('2026-11-29');
  const next = task('2026-12-01');
  const undated = task('');
  expect(homeworkWeeks([next, undated, weekend, early], 'active')).toEqual([
    { start: '2026-11-23', end: '2026-11-29', records: [early, weekend] },
    { start: '2026-11-30', end: '2026-12-04', records: [next] },
    { start: '', end: '', records: [undated] },
  ]);
  expect(homeworkWeeks([early, next, weekend], 'closed').map((week) => week.records)).toEqual([[next], [weekend, early]]);
});
