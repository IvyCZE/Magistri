// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bakalariApi } from './client';
import { rememberDirectorySchools } from './schoolDirectory';

// The raw responses and the expected projections are shared with the Kotlin
// parsers. Set UPDATE_FIXTURES=1 to regenerate the expected files from this
// (reference) implementation, then review the diff.
// `bakalari` is synthetic and committed. `bakalari-real` holds anonymised captures of a real school
// (made with scripts/capture-fixtures.mjs) and is picked up automatically when it exists.
const fixturesDir = path.resolve(__dirname, '../../fixtures');
const sets = ['bakalari', 'bakalari-real']
  .map((name) => [name, path.join(fixturesDir, name)] as const)
  .filter(([, dir]) => fs.existsSync(path.join(dir, 'raw')));

const orNull = <T,>(v: T | undefined | null | '') => (v === undefined || v === null || v === '' ? null : v);

const projectTimetable = (t: Awaited<ReturnType<typeof bakalariApi.getTimetable>>) => ({
  hours: t.hours.map((h) => ({ id: h.id, caption: h.caption, beginTime: h.beginTime, endTime: h.endTime })),
  days: t.days.map((d) => ({
    dayOfWeek: d.dayOfWeek,
    dayOfWeekName: d.dayOfWeekName,
    date: d.date,
    dayDescription: d.dayDescription ?? '',
    dayType: d.dayType,
    lessons: d.atoms.map((a) => ({
      hourId: a.hourId,
      subjectId: a.subjectId,
      subjectAbbrev: a.subjectAbbrev,
      subjectName: a.subjectName,
      teacherName: a.teacherName,
      teacherAbbrev: a.teacherAbbrev,
      roomAbbrev: a.roomAbbrev,
      change: a.change
        ? {
            type: a.change.changeType,
            description: a.change.description,
            typeName: orNull(a.change.typeName),
            typeAbbrev: orNull(a.change.typeAbbrev),
            substituteTeacher: orNull(a.change.substituteTeacher),
          }
        : null,
    })),
  })),
});

describe.each(sets)('API parsing reference output (%s)', (_name, root) => {
  const raw = (name: string) => JSON.parse(fs.readFileSync(path.join(root, 'raw', name), 'utf8'));

  const routes: Record<string, unknown> = {
    '/api/3/timetable/actual': raw('timetable-actual.json'),
    '/api/3/timetable/permanent': raw('timetable-permanent.json'),
    '/api/3/marks': raw('marks.json'),
    '/api/3/homeworks': raw('homeworks.json'),
    '/api/3/events': raw('events.json'),
    '/api/3/komens/messages/received': raw('komens-received.json'),
    '/api/3/komens/messages/noticeboard': raw('komens-noticeboard.json'),
    '/api/3/komens/messages/sent': { Messages: [] },
  };

  function check(name: string, actual: unknown) {
    const file = path.join(root, 'expected', name);
    const json = JSON.stringify(actual, null, 1) + '\n';
    if (process.env.UPDATE_FIXTURES) fs.writeFileSync(file, json);
    expect(actual).toEqual(JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T12:00:00'));
    vi.stubGlobal('fetch', async (input: string) => {
      const url = String(input).split('?')[0];
      const key = Object.keys(routes).find((k) => url.endsWith(k));
      if (!key) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(routes[key]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    rememberDirectorySchools([{ id: 'fixture-school', schoolUrl: 'https://school.example' }]);
    bakalariApi.setTokens({
      accessToken: 'a', refreshToken: 'r', expiresIn: 3600, tokenType: 'Bearer',
      userId: 'U1', schoolUrl: 'https://school.example', obtainedAt: Date.now(),
    });
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('timetable actual', async () => check('timetable-actual.json', projectTimetable(await bakalariApi.getTimetable('2026-10-05'))));
  it('timetable permanent', async () => check('timetable-permanent.json', projectTimetable(await bakalariApi.getTimetable(undefined, true))));

  it('marks', async () => {
    const subjects = await bakalariApi.getMarks();
    check('marks.json', subjects.flatMap((s) => s.marks.map((m) => ({
      id: m.id, subjectAbbrev: m.subjectAbbrev, subjectName: m.subjectName, markText: m.markText,
      weight: m.weight, caption: m.caption, markDate: m.markDate, isNew: m.isNew,
    }))));
  });

  it('homeworks', async () => {
    const list = await bakalariApi.getHomeworks();
    check('homeworks.json', list.map((h) => ({
      id: h.id, subjectAbbrev: h.subjectAbbrev, subjectName: h.subjectName, content: h.content,
      date: h.date, deadline: h.deadline, done: h.done, attachments: h.attachments ?? [],
    })));
  });

  it('events', async () => {
    const list = await bakalariApi.getEvents();
    check('events.json', list.map((e) => ({
      id: e.id, title: e.title, description: e.description, date: e.date, endDate: orNull(e.endDate),
      time: orNull(e.time), location: orNull(e.location), organizer: orNull(e.organizer), isPast: e.isPast ?? null,
    })));
  });

  it('messages', async () => {
    const list = await bakalariApi.getMessages();
    check('messages.json', list.filter((m) => m.type !== 'sent').map((m) => ({
      id: m.id, type: m.type, title: m.title, senderName: m.sender.name, date: m.date, unread: m.unread,
    })));
  });
});
