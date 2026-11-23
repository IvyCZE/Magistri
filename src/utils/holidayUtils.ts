import type { Language } from '../i18n/translations';
import { getAppLanguage } from './dateUtils';
import { getHolidayInfo as resolveHolidayInfo } from '../domain/holiday';
import type { HolidayInfo } from '../domain/holiday';

export type { HolidayInfo } from '../domain/holiday';

/** Resolves holiday information in the current app language. See `domain/holiday.ts`. */
export function getHolidayInfo(
  dayOrDate: Parameters<typeof resolveHolidayInfo>[0],
  lang: Language = getAppLanguage()
): HolidayInfo {
  return resolveHolidayInfo(dayOrDate, lang);
}
