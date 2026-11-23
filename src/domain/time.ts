/** Parses "HH:mm" or an ISO timestamp into minutes since midnight. */
export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const trimmed = String(timeStr).trim();
  const match = trimmed.match(/(?:^|T|\s)(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

/** Local calendar date as YYYY-MM-DD. */
export function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Shifts a calendar date without crossing daylight-saving offsets. */
export function shiftIsoDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
