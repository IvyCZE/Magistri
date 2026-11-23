import type { AbsenceRecord } from '../types/bakalari';

type AbsenceType = AbsenceRecord['type'];

/**
 * `/api/3/absence/student` only answers with per-day counters. The exact lessons come from
 * `/api/3/timetable/student/:id` (`hoursFromStudentTimetable`). When that is not available, the
 * per-subject part of a single-day `/api/3/absence/student?from=&to=` answer is matched with the
 * day's timetable (`resolveDayHours`): a subject whose number of absent lessons equals the number of
 * its lessons that day was absent in all of them, so the hours are known exactly. Everything else
 * keeps the plain counter.
 */

const COUNTERS: Array<{ type: AbsenceType; keys: string[]; suffix: string }> = [
  { type: 'Excused', keys: ['Ok', 'AOk'], suffix: 'ok' },
  { type: 'Unexcused', keys: ['Missed', 'AMiss'], suffix: 'missed' },
  { type: 'Unsolved', keys: ['Unsolved', 'A'], suffix: 'unsolved' },
  { type: 'Late', keys: ['Late', 'ALate'], suffix: 'late' },
  { type: 'Soon', keys: ['Soon', 'ASoon'], suffix: 'soon' },
  { type: 'SchoolEvent', keys: ['School', 'ASchool'], suffix: 'school' },
  { type: 'DistanceLearning', keys: ['DistanceTeaching', 'DistanceLearning'], suffix: 'dist' },
];

const BASE_TYPES: AbsenceType[] = ['Excused', 'Unexcused', 'Unsolved'];

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Counts a counter field: a number, or a list (then its length). */
export function counterOf(raw: any, keys: string[]): number {
  for (const key of keys) {
    const v = raw?.[key];
    if (v == null) continue;
    if (Array.isArray(v)) return v.length;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export interface DayLesson {
  hour: number;
  subjectName: string;
  subjectAbbrev: string;
}

export type DayHours = Partial<Record<AbsenceType, DayLesson[]>>;

const dateOnly = (value: unknown): string => (typeof value === 'string' ? value.split('T')[0] : '');
const subjectKey = (name: unknown): string => String(name ?? '').trim().toLowerCase();

/** Monday of the week that holds `date` (YYYY-MM-DD), as the timetable endpoint wants it. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Lessons the student actually had on a day, from a `/api/3/timetable/actual` answer. */
export function lessonsOfDay(timetable: any, date: string): DayLesson[] {
  if (!isObject(timetable)) return [];
  const captions = new Map<string, number>();
  for (const h of timetable.Hours || []) {
    const n = Number(String(h?.Caption ?? '').trim());
    if (h?.Id != null && Number.isInteger(n) && n >= 0) captions.set(String(h.Id), n);
  }
  const subjects = new Map<string, { name: string; abbrev: string }>();
  for (const s of timetable.Subjects || []) {
    if (s?.Id != null) subjects.set(String(s.Id), { name: s.Name || '', abbrev: s.Abbrev || s.Name || '' });
  }
  const day = (timetable.Days || []).find((d: any) => dateOnly(d?.Date) === date);
  const byHour = new Map<number, DayLesson>();
  for (const atom of day?.Atoms || []) {
    const hour = captions.get(String(atom?.HourId));
    const subject = subjects.get(String(atom?.SubjectId));
    const changeType = String(atom?.Change?.ChangeType || '');
    if (hour == null || !subject || changeType === 'Canceled' || changeType === 'Removed') continue;
    if (!byHour.has(hour)) byHour.set(hour, { hour, subjectName: subject.name, subjectAbbrev: subject.abbrev });
  }
  return [...byHour.values()].sort((a, b) => a.hour - b.hour);
}

/**
 * Pins the absent lessons of one day to hours. `perSubject` is the per-subject part of a
 * single-day answer. A subject is only resolved when all its lessons that day were absent and the
 * absences are of one kind. The three kinds that share the "Base" counter (excused, unexcused,
 * unsolved) are told apart only when the day has just one of them.
 */
export function resolveDayHours(day: any, perSubject: any[], lessons: DayLesson[]): DayHours {
  const totals = new Map<AbsenceType, number>(COUNTERS.map((c) => [c.type, counterOf(day, c.keys)]));
  const baseKinds = BASE_TYPES.filter((t) => (totals.get(t) || 0) > 0);

  const resolved: DayHours = {};
  const add = (type: AbsenceType, found: DayLesson[]) => {
    resolved[type] = [...(resolved[type] || []), ...found];
  };

  for (const s of perSubject) {
    const counts: Array<[AbsenceType | 'Base', number]> = [
      ['Base', Number(s?.Base) || 0],
      ['Late', Number(s?.Late) || 0],
      ['Soon', Number(s?.Soon) || 0],
      ['SchoolEvent', Number(s?.School) || 0],
      ['DistanceLearning', Number(s?.DistanceTeaching) || 0],
    ];
    const active = counts.filter(([, n]) => n > 0);
    const total = active.reduce((sum, [, n]) => sum + n, 0);
    if (total === 0) continue;
    const own = lessons.filter((l) => subjectKey(l.subjectName) === subjectKey(s.SubjectName));
    if (own.length !== total || active.length !== 1) continue;
    const [kind] = active[0];
    if (kind === 'Base') {
      if (baseKinds.length === 1) add(baseKinds[0], own);
    } else {
      add(kind, own);
    }
  }

  return withinCounters(day, resolved);
}

/** A result that disagrees with the day's own counters is not trusted. */
function withinCounters(day: any, hours: DayHours): DayHours {
  const result: DayHours = { ...hours };
  for (const c of COUNTERS) {
    if ((result[c.type]?.length || 0) > counterOf(day, c.keys)) delete result[c.type];
  }
  return result;
}

/** The `AbsentType` values of `/api/3/timetable/student/:id`; `NoAbsent` is a lesson without absence. */
const LESSON_ABSENT_TYPES: Record<string, AbsenceType> = {
  Absent: 'Unsolved',
  AbsentOk: 'Excused',
  AbsentMiss: 'Unexcused',
  AbsentLate: 'Late',
  AbsentSoon: 'Soon',
  AbsentSchool: 'SchoolEvent',
  DistanceTeaching: 'DistanceLearning',
};

/**
 * The `HourIndex` of that answer is the id of the hour definition (`Hours[].Id` of the timetable),
 * not the number shown to the student: the first lesson has id 3 when the school also has a 0th
 * lesson (id 2). `Hours[].Caption` is the number to show. The answer's `Start` is the fallback match.
 */
function hourCaptionLookup(hourDefinitions: any[]) {
  const byId = new Map<number, number>();
  const byStart = new Map<number, number>();
  for (const h of hourDefinitions) {
    const caption = Number(String(h?.Caption ?? '').trim());
    if (!Number.isInteger(caption) || caption < 0) continue;
    if (h?.Id != null && Number.isFinite(Number(h.Id))) byId.set(Number(h.Id), caption);
    if (Number.isFinite(Number(h?.Start))) byStart.set(Number(h.Start), caption);
  }
  return (a: any): number | undefined => byId.get(Number(a?.HourIndex)) ?? byStart.get(Number(a?.Start));
}

/**
 * Reads the answer of `/api/3/timetable/student/:id?fromDate=&toDate=` (the call Bakaláři's own app
 * makes), which lists every lesson of each day with its absence type. `hourDefinitions` is the `Hours`
 * list of a timetable answer; lessons whose hour is not in it are left out. Only days present in the
 * answer are in the result.
 */
export function hoursFromStudentTimetable(doc: any, hourDefinitions: any[]): Map<string, DayHours> {
  const result = new Map<string, DayHours>();
  if (!isObject(doc) || !Array.isArray(doc.Days)) return result;
  const captionOf = hourCaptionLookup(hourDefinitions);
  for (const d of doc.Days) {
    const date = dateOnly(d?.Date);
    if (!date || !Array.isArray(d?.Absences)) continue;
    const hours: DayHours = {};
    const seen = new Set<string>();
    for (const a of d.Absences) {
      const type = LESSON_ABSENT_TYPES[String(a?.AbsentType)];
      const hour = captionOf(a);
      if (!type || hour == null || seen.has(`${type}|${hour}`)) continue;
      seen.add(`${type}|${hour}`);
      const name = String(a?.Subject?.Name ?? '');
      (hours[type] ||= []).push({ hour, subjectName: name, subjectAbbrev: String(a?.Subject?.Abbrev ?? name) });
    }
    for (const lessons of Object.values(hours)) lessons.sort((x, y) => x.hour - y.hour);
    result.set(date, hours);
  }
  return result;
}

/** `hours` of a day from `hoursFromStudentTimetable`, checked against the counters of that day. */
export function checkedDayHours(day: any, hours: DayHours): DayHours {
  return withinCounters(day, hours);
}

export function formatHourRange(from: number, to: number): string {
  return from === to ? `${from}. h` : `${from}. - ${to}. h`;
}

/** "N. h" / "N. - N. h" when the lessons are known, otherwise "N h" (or "N×" for late and early). */
export function absenceHoursLabel(rec: Pick<AbsenceRecord, 'hourFrom' | 'hourTo' | 'hoursCount' | 'type'>): string {
  if (rec.hourFrom != null) return formatHourRange(rec.hourFrom, rec.hourTo ?? rec.hourFrom);
  const count = rec.hoursCount || 1;
  return rec.type === 'Late' || rec.type === 'Soon' ? `${count}×` : `${count} h`;
}

export interface ExcusePrefill {
  date: string;
  hourFrom?: number;
  hourTo?: number;
}

/** Screen address of the new-message form with the date and lessons of a record filled in. */
export function excuseTarget(rec: Pick<AbsenceRecord, 'date' | 'hourFrom' | 'hourTo'>): string {
  const params = new URLSearchParams({ excuse: '1', date: rec.date });
  if (rec.hourFrom != null) {
    params.set('from', String(rec.hourFrom));
    params.set('to', String(rec.hourTo ?? rec.hourFrom));
  }
  return `new-message?${params.toString()}`;
}

/**
 * The hour pickers of the message form work with the id of the hour definition, an absence record with
 * the lesson number (the caption). They differ whenever the school has a 0th lesson (ids start at 2),
 * so a prefill must be translated or lessons 5-7 would show as 3-5.
 */
export function hourIdOfLesson(hours: readonly { id: number; caption: string }[], lesson: number): number {
  const hour = hours.find((h) => parseInt(h.caption, 10) === lesson);
  return hour ? hour.id : lesson;
}

export function parseExcusePrefill(params: URLSearchParams | null): ExcusePrefill | null {
  if (!params || params.get('excuse') !== '1') return null;
  const date = params.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const from = params.get('from');
  const to = params.get('to');
  const hourFrom = from != null && /^\d+$/.test(from) ? Number(from) : undefined;
  const hourTo = to != null && /^\d+$/.test(to) ? Number(to) : hourFrom;
  return { date, hourFrom, hourTo: hourFrom != null ? Math.max(hourTo ?? hourFrom, hourFrom) : undefined };
}

function sameValue(values: string[]): string {
  const first = values[0];
  return first && values.every((v) => v === first) ? first : '';
}

/** One record per day, type and run of consecutive lessons, plus a plain counter for the rest. */
function recordsOfDay(a: any, date: string, idBase: string, note: string, hours: DayHours): AbsenceRecord[] {
  const records: AbsenceRecord[] = [];
  for (const c of COUNTERS) {
    const total = counterOf(a, c.keys);
    if (total <= 0) continue;

    const byHour = new Map<number, DayLesson>();
    (hours[c.type] || []).forEach((l) => byHour.set(l.hour, l));
    const sorted = [...byHour.keys()].sort((x, y) => x - y);
    let start = 0;
    for (let i = 1; i <= sorted.length; i++) {
      if (i < sorted.length && sorted[i] === sorted[i - 1] + 1) continue;
      const run = sorted.slice(start, i);
      const from = run[0];
      const to = run[run.length - 1];
      const lessons = run.map((h) => byHour.get(h)!);
      records.push({
        id: `${idBase}-${c.suffix}-${from}`,
        date,
        type: c.type,
        hoursCount: run.length,
        lessonHour: from === to ? from : `${from}–${to}`,
        hourFrom: from,
        hourTo: to,
        hourLabel: formatHourRange(from, to),
        subjectAbbrev: sameValue(lessons.map((l) => l.subjectAbbrev)),
        subjectName: sameValue(lessons.map((l) => l.subjectName)),
        note,
      });
      start = i;
    }

    const rest = total - sorted.length;
    if (rest > 0) {
      records.push({
        id: `${idBase}-${c.suffix}`,
        date,
        type: c.type,
        hoursCount: rest,
        lessonHour: rest,
        hourLabel: absenceHoursLabel({ hoursCount: rest, type: c.type }),
        subjectAbbrev: '',
        subjectName: '',
        note,
      });
    }
  }
  return records;
}

/** `hoursByDate` holds what `resolveDayHours` found for each date; days missing from it keep counters. */
export function buildAbsenceRecords(rawAbsences: any[], hoursByDate: Map<string, DayHours> = new Map()): AbsenceRecord[] {
  const records: AbsenceRecord[] = [];
  rawAbsences.forEach((a, idx) => {
    if (!isObject(a)) return;
    const date = dateOnly(a.Date);
    const idBase = String(a.Id || `${date}-${idx}`);
    const note = a.Note || a.Description || a.Reason || '';
    records.push(...recordsOfDay(a, date, idBase, note, hoursByDate.get(date) || {}));
  });
  // Newest day first, lessons of one day in school order.
  records.sort((r1, r2) => (r2.date || '').localeCompare(r1.date || '') || (r1.hourFrom ?? 99) - (r2.hourFrom ?? 99));
  return records;
}

export interface AbsenceWeek {
  /** Monday of the week (YYYY-MM-DD), or '' for records without a valid date. */
  start: string;
  /** Friday of the week, or Sunday when a record falls on the weekend. */
  end: string;
  records: AbsenceRecord[];
}

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Groups records by school week, newest week first; weeks without a record do not appear. */
export function groupRecordsByWeek(records: AbsenceRecord[]): AbsenceWeek[] {
  const byStart = new Map<string, AbsenceRecord[]>();
  for (const rec of records) {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(rec.date) ? weekStart(rec.date) : '';
    byStart.set(start, [...(byStart.get(start) || []), rec]);
  }
  return [...byStart.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([start, weekRecords]) => {
      if (!start) return { start, end: '', records: weekRecords };
      const weekend = weekRecords.some((r) => r.date > addDays(start, 4));
      return { start, end: addDays(start, weekend ? 6 : 4), records: weekRecords };
    });
}
