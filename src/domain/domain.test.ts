import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeCountdown } from './countdown';
import { groupConsecutiveEvents, normalizeEventTitle } from './eventGrouping';
import { getHolidayInfo } from './holiday';
import { selectTimetableDay } from './timetableSelection';

// The same fixtures are read by the Kotlin unit tests, which keeps both
// implementations of the logic aligned.
const dir = path.resolve(__dirname, '../../fixtures/bakalari/domain');
const timetables = JSON.parse(fs.readFileSync(path.join(dir, 'timetables.json'), 'utf8'));
const cases = JSON.parse(fs.readFileSync(path.join(dir, 'cases.json'), 'utf8'));

describe('timetable selection and countdown fixtures', () => {
  for (const c of cases) {
    it(c.name, () => {
      const now = new Date(c.now);
      const selection = selectTimetableDay(
        now,
        { actual: timetables.actual, permanent: timetables.permanent, nextWeek: c.nextWeekLoaded ? timetables.nextWeek : null },
        'cs'
      );
      expect({
        date: selection.day?.date ?? null,
        dayOfWeek: selection.day?.dayOfWeek ?? null,
        isPerm: selection.isPerm,
        isToday: selection.isToday,
        isTomorrow: selection.isTomorrow,
        isNextMonday: selection.isNextMonday,
        lessonCount: selection.day?.atoms.length ?? 0,
      }).toEqual(c.selection);

      const countdown = computeCountdown({
        now,
        actual: timetables.actual,
        permanent: timetables.permanent,
        mode: c.mode,
        hideDecimals: c.hideDecimals,
        lang: 'cs',
      });
      expect({
        state: countdown.state,
        labelKey: countdown.labelKey,
        holidayLabel: countdown.holidayLabel ?? null,
        counterValue: countdown.counterValue,
        progress: Number(countdown.progress.toFixed(4)),
      }).toEqual(c.countdown);
    });
  }

  it('reports absolute phase boundaries during a lesson', () => {
    const now = new Date('2026-10-06T08:20:00');
    const r = computeCountdown({
      now, actual: timetables.actual, permanent: timetables.permanent, mode: 'lesson_time', hideDecimals: false, lang: 'cs',
    });
    expect(r.phaseStartMs).toBe(new Date('2026-10-06T08:00:00').getTime());
    expect(r.phaseEndMs).toBe(new Date('2026-10-06T08:45:00').getTime());
  });
});

describe('holiday', () => {
  it('detects holidays from the API day type and description', () => {
    expect(getHolidayInfo({ dayType: 'Holiday', dayDescription: 'Podzimní prázdniny', atoms: [] }, 'cs')).toMatchObject({
      isHoliday: true, isPublicHoliday: false, type: 'holiday', title: 'Podzimní prázdniny',
    });
    expect(getHolidayInfo({ dayType: 'Celebration', dayDescription: 'Den vzniku státu', atoms: [] }, 'en')).toMatchObject({
      isHoliday: true, isPublicHoliday: true, type: 'celebration',
    });
    expect(getHolidayInfo({ dayType: 'DirectorDay', atoms: [] }, 'en').badgeLabel).toBe("Director's Day Off");
  });

  it('does not treat a normal workday or a bare date as a holiday', () => {
    expect(getHolidayInfo({ dayType: 'WorkDay', dayDescription: '', atoms: [{}] }, 'cs').isHoliday).toBe(false);
    expect(getHolidayInfo('2026-10-06', 'cs').isHoliday).toBe(false);
    expect(getHolidayInfo(undefined, 'cs').isHoliday).toBe(false);
  });
});

describe('event grouping', () => {
  const now = new Date('2026-10-06T12:00:00');
  const ev = (id: string, title: string, date: string, extra: object = {}) => ({ id, title, description: '', date, ...extra });

  it('strips day indicators from titles', () => {
    expect(normalizeEventTitle('Exkurze - 1. den')).toBe('Exkurze');
    expect(normalizeEventTitle('Kurz (den 2/5)')).toBe('Kurz');
    expect(normalizeEventTitle('Výlet')).toBe('Výlet');
  });

  it('merges consecutive days and across a weekend', () => {
    const grouped = groupConsecutiveEvents(
      [ev('1', 'Lyžák - 1. den', '2026-10-09'), ev('2', 'Lyžák - 2. den', '2026-10-12'), ev('3', 'Divadlo', '2026-10-20')],
      now
    );
    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({ title: 'Lyžák', date: '2026-10-09', endDate: '2026-10-12', isPast: false });
  });

  it('keeps events apart when the gap is too long', () => {
    expect(groupConsecutiveEvents([ev('1', 'Test', '2026-10-06'), ev('2', 'Test', '2026-10-09')], now)).toHaveLength(2);
  });

  it('marks events that ended before now as past', () => {
    expect(groupConsecutiveEvents([ev('1', 'Old', '2026-10-01')], now)[0].isPast).toBe(true);
  });
});

describe('shared holiday and event fixtures', () => {
  const holidayCases = JSON.parse(fs.readFileSync(path.join(dir, 'holiday-cases.json'), 'utf8'));
  const eventCases = JSON.parse(fs.readFileSync(path.join(dir, 'event-cases.json'), 'utf8'));

  it('resolves holidays as recorded', () => {
    for (const c of holidayCases) {
      const day = { dayType: c.input.dayType, dayDescription: c.input.dayDescription, atoms: new Array(c.input.atomsCount).fill({}) };
      expect(getHolidayInfo(day, c.lang), JSON.stringify(c.input)).toEqual(c.expected);
    }
  });

  it('groups events as recorded', () => {
    for (const c of eventCases) {
      expect(groupConsecutiveEvents(JSON.parse(JSON.stringify(c.input)), new Date(c.now)), c.name).toEqual(c.expected);
    }
  });
});
