// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bakalariApi } from './client';
import { rememberDirectorySchools } from './schoolDirectory';

// The v3 answer of a real school (checked on a capture): ID, DateStart (assigned), DateEnd (due),
// and Subject / Teacher as objects. HOMEWORKS_JSON=/path/homeworks.json also checks a capture file.
const syntheticFile = path.resolve(__dirname, '../../fixtures/bakalari/raw/homeworks.json');
const captureFile = process.env.HOMEWORKS_JSON;

function serve(doc: unknown) {
  const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(doc), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  rememberDirectorySchools([{ id: 'fixture-school', schoolUrl: 'https://school.example' }]);
  bakalariApi.setTokens({
    accessToken: 'a', refreshToken: 'r', expiresIn: 3600, tokenType: 'Bearer',
    userId: 'U1', schoolUrl: 'https://school.example', obtainedAt: Date.now(),
  });
  return fetch;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('homework parsing', () => {
  beforeEach(() => serve(JSON.parse(fs.readFileSync(syntheticFile, 'utf8'))));

  it('reads subject, teacher, both dates and a stable id', async () => {
    const [first, second] = await bakalariApi.getHomeworks();
    expect(first).toMatchObject({
      id: 'H1', subjectId: 'M', subjectAbbrev: 'M', subjectName: 'Matematika',
      teacherName: 'Mgr. Jana Nováková', date: '2026-10-01', deadline: '2026-10-09', done: false,
    });
    expect(second).toMatchObject({ id: 'H2', subjectAbbrev: 'AJ', date: '2026-10-05', deadline: '2026-10-12', done: true });
    expect((await bakalariApi.getHomeworks())[0].id).toBe(first.id);
  });

  it('requests a wider range and retains old assignments with future deadlines and unchecked closed homework', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-23T12:00:00'));
    const fetch = serve({ Homeworks: [
      { ID: 'long-running', DateStart: '2026-09-01T00:00:00+02:00', DateEnd: '2026-11-26T00:00:00+01:00' },
      { ID: 'closed', DateStart: '2026-09-04T00:00:00+02:00', DateEnd: '2026-09-05T00:00:00+02:00', Closed: true },
    ] });

    const list = await bakalariApi.getHomeworks();
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/3\/homeworks\?from=2025-11-23&to=2027-02-21$/);
    expect(list).toMatchObject([
      { id: 'long-running', deadline: '2026-11-26', closed: false, done: false },
      { id: 'closed', deadline: '2026-09-05', closed: true, done: false },
    ]);
  });
});

describe.skipIf(!captureFile)('homework capture (HOMEWORKS_JSON)', () => {
  it('every homework has an id, a subject, a teacher, a content and both dates', async () => {
    const doc = JSON.parse(fs.readFileSync(captureFile as string, 'utf8'));
    serve(doc);
    const list = await bakalariApi.getHomeworks();
    expect(list.length).toBe(doc.Homeworks.length);
    const missing = (field: keyof (typeof list)[number]) => list.filter((h) => !h[field]).length;
    const summary = {
      count: list.length,
      noSubjectAbbrev: missing('subjectAbbrev'),
      noSubjectName: missing('subjectName'),
      noTeacher: missing('teacherName'),
      noContent: missing('content'),
      noDate: missing('date'),
      noDeadline: missing('deadline'),
      badDate: list.filter((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h.date) || !/^\d{4}-\d{2}-\d{2}$/.test(h.deadline)).length,
      deadlineBeforeDate: list.filter((h) => h.deadline < h.date).length,
      randomIds: list.filter((h) => /^0\.\d+$/.test(h.id)).length,
      duplicateIds: list.length - new Set(list.map((h) => h.id)).size,
    };
    console.log(`Homework capture: ${JSON.stringify(summary)}`);
    expect(summary).toEqual({
      count: list.length, noSubjectAbbrev: 0, noSubjectName: 0, noTeacher: 0, noContent: 0, noDate: 0, noDeadline: 0,
      badDate: 0, deadlineBeforeDate: 0, randomIds: 0, duplicateIds: 0,
    });
  });
});
