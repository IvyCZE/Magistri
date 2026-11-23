import type { Language } from '../i18n/translations';
import type { TimetableDay } from '../types/bakalari';

export interface HolidayInfo {
  isHoliday: boolean;
  isPublicHoliday: boolean;
  type: 'celebration' | 'holiday' | 'director' | 'custom' | null;
  title: string;
  badgeLabel: string;
  shortBadgeLabel: string;
  description?: string;
}

/**
 * Pure holiday resolution (no app state). The language is a required argument
 * so Kotlin can port the rules without any settings lookup.
 *
 * Resolves holiday and day off information directly from Bakalari API data
 * (DayType and DayDescription).
 *
 * Bakalari DayType values:
 * - 'Celebration': Státní svátek / významný den / Public holiday
 * - 'Holiday': Školní prázdniny / School break
 * - 'DirectorDay': Ředitelské volno / Director's day off
 * - 'WorkDay': Běžný pracovní den
 * - 'Weekend': Víkend
 */
export function getHolidayInfo(
  dayOrDate:
    | Partial<TimetableDay>
    | { date?: string; dayType?: string; dayDescription?: string; atoms?: any[] }
    | string
    | Date
    | undefined
    | null,
  lang: Language
): HolidayInfo {
  const notHoliday: HolidayInfo = {
    isHoliday: false,
    isPublicHoliday: false,
    type: null,
    title: '',
    badgeLabel: '',
    shortBadgeLabel: '',
  };

  if (!dayOrDate) return notHoliday;

  const dayType =
    typeof dayOrDate === 'object' && dayOrDate !== null && !(dayOrDate instanceof Date)
      ? String((dayOrDate as any).dayType || '').trim()
      : '';

  const dayDesc =
    typeof dayOrDate === 'object' && dayOrDate !== null && !(dayOrDate instanceof Date)
      ? String((dayOrDate as any).dayDescription || '').trim()
      : '';

  const atomsCount =
    typeof dayOrDate === 'object' && dayOrDate !== null && !(dayOrDate instanceof Date) && Array.isArray((dayOrDate as any).atoms)
      ? (dayOrDate as any).atoms.length
      : undefined;

  const isEn = lang === 'en';
  const normDayType = dayType.toLowerCase();
  const lowerDesc = dayDesc.toLowerCase();

  // 1. Bakalari DayType Celebration or description explicitly indicating state holiday
  if (normDayType === 'celebration' || /\b(svátek|svatek)\b/i.test(lowerDesc)) {
    const title = dayDesc || (isEn ? 'Public Holiday' : 'Státní svátek');
    return {
      isHoliday: true,
      isPublicHoliday: true,
      type: 'celebration',
      title,
      badgeLabel: isEn ? 'Public Holiday' : 'Státní svátek',
      shortBadgeLabel: isEn ? 'Holiday' : 'Svátek',
      description: dayDesc && dayDesc !== title
        ? dayDesc
        : (isEn ? 'Public holiday — no classes scheduled.' : 'Státní svátek — v tento den se nevyučuje.'),
    };
  }

  // 2. Bakalari DayType Holiday or description indicating school holiday/vacation
  if (normDayType === 'holiday' || /prázdnin|prazdnin|vacation/i.test(lowerDesc)) {
    const title = dayDesc || (isEn ? 'School Break' : 'Prázdniny');
    return {
      isHoliday: true,
      isPublicHoliday: false,
      type: 'holiday',
      title,
      badgeLabel: isEn ? 'School Break' : 'Prázdniny',
      shortBadgeLabel: isEn ? 'Break' : 'Prázdniny',
      description: dayDesc && dayDesc !== title
        ? dayDesc
        : (isEn ? 'School holiday / vacation — free day.' : 'Školní prázdniny — volný den.'),
    };
  }

  // 3. Bakalari DayType DirectorDay or description indicating director's day off
  if (normDayType === 'directorday' || /ředitel|reditel|volno\s+ředitele/i.test(lowerDesc)) {
    const title = dayDesc || (isEn ? "Director's Day Off" : 'Ředitelské volno');
    return {
      isHoliday: true,
      isPublicHoliday: false,
      type: 'director',
      title,
      badgeLabel: isEn ? "Director's Day Off" : 'Ředitelské volno',
      shortBadgeLabel: isEn ? 'Day Off' : 'Řed. volno',
      description: dayDesc && dayDesc !== title
        ? dayDesc
        : (isEn ? "Director's day off — no classes scheduled." : 'Ředitelské volno — v tento den se nevyučuje.'),
    };
  }

  // 4. Day description provided by Bakalari and no scheduled lessons
  if (dayDesc && (atomsCount === 0 || normDayType !== 'workday')) {
    const isStateHolidayDesc = /státní|statni|státnost|statnost/i.test(lowerDesc);
    return {
      isHoliday: true,
      isPublicHoliday: isStateHolidayDesc,
      type: isStateHolidayDesc ? 'celebration' : 'custom',
      title: dayDesc,
      badgeLabel: isStateHolidayDesc
        ? (isEn ? 'Public Holiday' : 'Státní svátek')
        : (isEn ? 'Day Off' : 'Volný den'),
      shortBadgeLabel: isStateHolidayDesc
        ? (isEn ? 'Holiday' : 'Svátek')
        : (isEn ? 'Day Off' : 'Volno'),
      description: isEn ? 'No classes scheduled on this day.' : 'V tento den se nevyučuje.',
    };
  }

  // 5. Non-workday and non-weekend DayType from Bakalari with no lessons
  if (normDayType && normDayType !== 'workday' && normDayType !== 'weekend' && atomsCount === 0) {
    return {
      isHoliday: true,
      isPublicHoliday: false,
      type: 'custom',
      title: dayDesc || (isEn ? 'Day Off' : 'Volný den'),
      badgeLabel: isEn ? 'Day Off' : 'Volný den',
      shortBadgeLabel: isEn ? 'Day Off' : 'Volno',
      description: isEn ? 'No classes scheduled on this day.' : 'V tento den se nevyučuje.',
    };
  }

  return notHoliday;
}
