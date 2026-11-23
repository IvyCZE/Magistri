// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bakalariApi } from './client';
import { rememberDirectorySchools } from './schoolDirectory';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const absenceAnswer = {
  Absences: [
    { Date: '2026-11-05T00:00:00+01:00', Unsolved: 0, Ok: 0, Missed: 0, Late: 1, Soon: 0, School: 0, DistanceTeaching: 0 },
  ],
  AbsencesPerSubject: [],
};

// Hour ids start at 2 for the 0th lesson, so HourIndex 9 is the 7th lesson.
const hourDefinitions = {
  Hours: Array.from({ length: 11 }, (_, i) => ({ Id: i + 2, Caption: String(i), Start: 415 + i * 50 })),
};

const lesson = (HourIndex: number, abbrev: string, AbsentType = 'NoAbsent') => ({
  HourIndex,
  Start: 415 + (HourIndex - 2) * 50,
  AbsentType,
  Minutes: AbsentType === 'NoAbsent' ? 0 : 5,
  Subject: { Id: abbrev, Abbrev: abbrev, Name: abbrev },
});

describe('getAbsence lessons', () => {
  let urls: string[];

  function stub(routes: Record<string, () => Response>) {
    vi.stubGlobal('fetch', async (input: string) => {
      const url = String(input);
      urls.push(url);
      const key = Object.keys(routes).find((k) => url.includes(k));
      return key ? routes[key]() : new Response('{}', { status: 404 });
    });
  }

  beforeEach(() => {
    urls = [];
    rememberDirectorySchools([{ id: 'fixture-school', schoolUrl: 'https://school.example' }]);
    bakalariApi.setTokens({
      accessToken: 'a', refreshToken: 'r', expiresIn: 3600, tokenType: 'Bearer',
      userId: `U${Math.random()}`, schoolUrl: 'https://school.example', obtainedAt: Date.now(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('asks the student timetable with the last 5 characters of UserUID and pins the lesson', async () => {
    stub({
      '/api/3/absence/student': () => json(absenceAnswer),
      '/api/3/user': () => json({ UserUID: '3604/ZGX1P7' }),
      '/api/3/timetable/permanent': () => json(hourDefinitions),
      '/api/3/timetable/student/': () =>
        json({ Days: [{ Date: '2026-11-05T00:00:00+01:00', Absences: [lesson(8, 'SMAT'), lesson(9, 'SMAT', 'AbsentLate')] }] }),
    });
    const { records } = await bakalariApi.getAbsence();
    expect(urls.some((u) => u.includes('/api/3/timetable/student/GX1P7?fromDate=2026-11-05&toDate=2026-11-05'))).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ type: 'Late', hourFrom: 7, hourLabel: '7. h', subjectAbbrev: 'SMAT' });
  });

  it('keeps the counter when the student timetable is refused and the per-subject fallback is no help', async () => {
    stub({
      '/api/3/absence/student': () => json(absenceAnswer),
      '/api/3/user': () => json({ UserUID: '3604/QWERT9' }),
      '/api/3/timetable/permanent': () => json(hourDefinitions),
      '/api/3/timetable/student/': () => json({ Message: 'forbidden' }, 403),
      '/api/3/timetable/actual': () => json({ Hours: [], Subjects: [], Days: [] }),
    });
    const { records } = await bakalariApi.getAbsence();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ type: 'Late', hoursCount: 1, hourLabel: '1×' });
    expect(records[0].hourFrom).toBeUndefined();
  });
});
