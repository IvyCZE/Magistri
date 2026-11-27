import { CalendarDays } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import type { TimetableDay } from '../../types/bakalari';
import { formatCzechDate, getDayOfWeekName } from '../../utils/dateUtils';
import type { HolidayInfo } from '../../utils/holidayUtils';
import { TimetableDetailsSheet } from './TimetableDetailsSheet';

interface HolidayDetailsSheetProps {
  day: TimetableDay;
  holiday: HolidayInfo;
  onClose: () => void;
}

export function HolidayDetailsSheet({ day, holiday, onClose }: HolidayDetailsSheetProps) {
  const { t, language } = useSettingsStore();
  const dayName = getDayOfWeekName(day.dayOfWeek ?? day.dayOfWeekName, language);
  const date = formatCzechDate(day.date, 'full', language);

  return (
    <TimetableDetailsSheet
      label={holiday.badgeLabel !== holiday.title &&
        <span className="text-sky-700 dark:text-sky-300">{holiday.badgeLabel}</span>}
      title={holiday.title}
      onClose={onClose}
    >
      <div className="flex items-center gap-3 rounded-m3-xl bg-m3-surface-container-high p-3 text-sm font-extrabold">
        <CalendarDays aria-hidden="true" className="size-5 shrink-0 text-m3-primary" />
        <span>{dayName}{date && <>, <time dateTime={day.date}>{date}</time></>}</span>
      </div>
      <p className="rounded-m3-xl bg-sky-500/10 p-3 text-xs leading-relaxed text-m3-on-surface-variant">
        {holiday.description || t('dayOffNotice')}
      </p>
    </TimetableDetailsSheet>
  );
}
