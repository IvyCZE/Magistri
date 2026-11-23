import { shiftIsoDate } from './time';

export function isIsoDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date));
}

/** Monday of the week containing the given calendar date. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftIsoDate(date, -((day + 6) % 7));
}

export function groupBySchoolWeek<T>(records: readonly T[], dateOf: (record: T) => string, order: 'asc' | 'desc' = 'desc') {
  const byStart = new Map<string, T[]>();
  for (const record of records) {
    const date = dateOf(record);
    const start = isIsoDate(date) ? weekStart(date) : '';
    const week = byStart.get(start);
    if (week) week.push(record);
    else byStart.set(start, [record]);
  }

  return [...byStart.entries()]
    .sort(([a], [b]) => Number(!a) - Number(!b) || (order === 'asc' ? a.localeCompare(b) : b.localeCompare(a)))
    .map(([start, records]) => {
      if (!start) return { start, end: '', records };
      const friday = shiftIsoDate(start, 4);
      const end = records.some((record) => dateOf(record) > friday) ? shiftIsoDate(start, 6) : friday;
      return { start, end, records };
    });
}
