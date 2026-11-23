import React, { useState } from 'react';
import { useBackDismiss } from '../native/backDismiss';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User,
  AlertCircle,
  Ban,
  CalendarPlus,
  X,
  Layers,
  Rows3,
  Columns3,
  CalendarDays,
  PencilLine,
  Pencil,
  Trash2,
} from 'lucide-react';
import { MaterialMorphingLoader } from '../components/common/MaterialMorphingLoader';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore, TimetableLayoutMode } from '../stores/settingsStore';
import { LessonCard } from '../components/common/LessonCard';
import { Lesson, TestMark, TimetableData, TimetableDay, TimetableHour } from '../types/bakalari';
import { cleanLessonGroup } from '../utils/textUtils';
import { getHolidayInfo, HolidayInfo } from '../utils/holidayUtils';
import {
  formatCzechDate,
  formatCzechDateRange,
  getDayOfWeekName,
  getAppDate,
  getWeekCycleParity,
  getRelevantSchoolWeekMonday,
  getRelevantMondayIso,
  getCurrentTimetableHour,
  parseTimeToMinutes,
  getTimetableHourProgress,
  formatHourTime,
} from '../utils/dateUtils';
import { responsiveGroupRadius } from '../utils/groupRadius';

type TimetableTab = 'current' | 'permanent';

/**
 * One continuous, uniform highlight band for today's lessons.
 * It wraps exactly the scheduled lesson cells marked by `cellSelector` (e.g. `[data-today-cell]`)
 * and "flows around" them: rendered behind the cards, extending exactly to half the gap between adjacent cells.
 * Position is measured from the matching cells within its own parent container
 * (the band must be a direct child of the relative container).
 */
/**
 * Font size that lets the longest word of `text` fit the width of the nearest
 * `container-type: inline-size` ancestor (`cqw` = 1% of that width). `charEm`
 * is the average glyph width in em for the style used.
 */
const fitWordFontSize = (text: string, charEm: number, minPx: number, maxPx: number): string => {
  const longest = Math.max(1, ...text.split(/\s+/).map((w) => w.length));
  return `clamp(${minPx}px, ${(100 / (longest * charEm)).toFixed(2)}cqw, ${maxPx}px)`;
};

const TimetableHighlightBand: React.FC<{
  cellSelector: string;
  padVertical?: boolean;
  padHorizontal?: boolean;
}> = ({
  cellSelector,
  padVertical = true,
  padHorizontal = true,
}) => {
  const bandRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const band = bandRef.current;
    const container = band?.parentElement;
    if (!band || !container) return;

    const apply = () => {
      try {
        const cells = Array.from(
          container.querySelectorAll<HTMLElement>(cellSelector)
        );
        if (!cells.length) {
          band.style.display = 'none';
          return;
        }
        band.style.display = '';

        // Read real column and row gaps from the grid / container
        let colGap = 8;
        let rowGap = 8;
        const gridEl = container.querySelector('.grid') || container;
        if (gridEl) {
          const gs = getComputedStyle(gridEl);
          const parsedCg = parseFloat(gs.columnGap);
          const parsedRg = parseFloat(gs.rowGap);
          if (!isNaN(parsedCg) && parsedCg > 0) colGap = parsedCg;
          if (!isNaN(parsedRg) && parsedRg > 0) rowGap = parsedRg;
        }

        const padX = padHorizontal ? colGap / 2 : 0;
        const padY = padVertical ? rowGap / 2 : 0;
        const cRect = container.getBoundingClientRect();

        let minLeft = Infinity;
        let minTop = Infinity;
        let maxRight = -Infinity;
        let maxBottom = -Infinity;

        cells.forEach((cell) => {
          const r = cell.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            if (r.left < minLeft) minLeft = r.left;
            if (r.top < minTop) minTop = r.top;
            if (r.right > maxRight) maxRight = r.right;
            if (r.bottom > maxBottom) maxBottom = r.bottom;
          }
        });

        if (minLeft === Infinity) {
          band.style.display = 'none';
          return;
        }

        band.style.left = `${minLeft - cRect.left - padX}px`;
        band.style.top = `${minTop - cRect.top - padY}px`;
        band.style.width = `${maxRight - minLeft + padX * 2}px`;
        band.style.height = `${maxBottom - minTop + padY * 2}px`;
      } catch (err) {
        console.error('Failed to layout TimetableHighlightBand:', err);
      }
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(container);
    window.addEventListener('resize', apply);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
    };
  });

  return (
    <div
      ref={bandRef}
      aria-hidden="true"
      className="absolute z-0 bg-m3-primary opacity-25 rounded-m3-2xl pointer-events-none"
    />
  );
};

export const TimetablePage: React.FC = () => {
  const {
    timetable,
    actualTimetable,
    permanentTimetable,
    isPermanentFallback,
    isTimetableLoading,
    fetchTimetable,
    getCachedTimetableWeek,
    testMarks,
    addTestMark,
    updateTestMark,
    removeTestMark,
  } = useDataStore();
  const { timetableLayout, setTimetableLayout, t, language: lang } = useSettingsStore();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<TimetableTab>(() =>
    isPermanentFallback ? 'permanent' : 'current'
  );
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [fetchError, setFetchError] = useState<boolean>(false);

  // A failed download with nothing saved for the week ends in the error state instead of an endless spinner.
  const loadTimetable = (date?: string, permanent = false) =>
    fetchTimetable(date, permanent).catch(() => {
      setFetchError(true);
      return null;
    });

  // Parity of the relevant school week (advances to next week starting on Saturday)
  const currentWeekParity = getWeekCycleParity(getRelevantSchoolWeekMonday(getAppDate(), 0));
  const [permanentCycle, setPermanentCycle] = useState<'odd' | 'even'>(currentWeekParity);

  // Helper to compute ISO date string (YYYY-MM-DD) for Monday of a given week offset.
  // On Saturday and Sunday, offset 0 is already the upcoming week (next Monday).
  const getMondayIso = (offsetWeeks: number) => {
    return getRelevantMondayIso(getAppDate(), offsetWeeks);
  };

  const handleTabChange = (tab: TimetableTab) => {
    setActiveTab(tab);
    setFetchError(false);
    if (tab === 'permanent') {
      const hasPermLessons = permanentTimetable.days.some((d) => d.atoms && d.atoms.length > 0);
      if (!hasPermLessons) {
        loadTimetable(undefined, true);
      }
    } else {
      const targetIso = weekOffset !== 0 ? getMondayIso(weekOffset) : undefined;
      const d = getAppDate();
      const isWk = d.getDay() === 0 || d.getDay() === 6;
      const mondayIso = targetIso || (isWk ? getMondayIso(0) : undefined);
      loadTimetable(mondayIso, false);
    }
  };

  const handleWeekOffsetChange = (newOffset: number) => {
    setWeekOffset(newOffset);
    setFetchError(false);
    if (activeTab === 'current') {
      const targetIso = newOffset !== 0 ? getMondayIso(newOffset) : undefined;
      const d = getAppDate();
      const isWk = d.getDay() === 0 || d.getDay() === 6;
      const mondayIso = targetIso || (isWk ? getMondayIso(0) : undefined);
      loadTimetable(mondayIso, false);
    }
  };

  // Initial day of week for default tab selection (1 = Mon, 5 = Fri)
  const initialTodayJs = getAppDate().getDay();
  const initialDayOfWeek = initialTodayJs >= 1 && initialTodayJs <= 5 ? initialTodayJs : 1;

  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    return initialDayOfWeek - 1;
  });

  const [activeLessonModal, setActiveLessonModal] = useState<{
    lesson: Lesson;
    hour?: TimetableHour;
    day?: TimetableDay;
  } | null>(null);

  const [activeHolidayModal, setActiveHolidayModal] = useState<{
    day: TimetableDay;
    holiday: HolidayInfo;
  } | null>(null);

  // Description of the test mark in the lesson modal; saved on its own shortly after typing stops.
  const [testDraft, setTestDraft] = useState('');
  const pendingTestSave = React.useRef<{ id: string; description: string } | null>(null);

  // Look up a user test mark for a concrete date + hour (never in permanent timetable)
  const testMarkFor = (date?: string, hourId?: number): TestMark | undefined =>
    activeTab !== 'permanent' && date && hourId !== undefined
      ? testMarks.find((m) => m.date === date && m.hourId === hourId)
      : undefined;

  const openLessonModal = (lesson: Lesson, hour: TimetableHour | undefined, day: TimetableDay | undefined) => {
    setTestDraft('');
    setActiveLessonModal({ lesson, hour, day });
  };

  const closeLessonModal = () => {
    // Typing that the delay below has not saved yet.
    const pending = pendingTestSave.current;
    if (pending) updateTestMark(pending.id, { description: pending.description });
    pendingTestSave.current = null;
    setTestDraft('');
    setActiveLessonModal(null);
  };

  useBackDismiss(activeLessonModal !== null, closeLessonModal);
  useBackDismiss(activeHolidayModal !== null, () => setActiveHolidayModal(null));

  const modalTestMark = activeTab !== 'permanent' && activeLessonModal?.day?.date
    ? testMarkFor(activeLessonModal.day.date, activeLessonModal.hour?.id)
    : undefined;

  const modalTestMarkId = modalTestMark?.id;
  React.useEffect(() => {
    setTestDraft(modalTestMark?.description || '');
    pendingTestSave.current = null;
    // Only a different mark (or none) resets the field, not our own saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalTestMarkId]);

  React.useEffect(() => {
    if (!modalTestMark) return;
    const description = testDraft.trim();
    if (description === (modalTestMark.description || '')) {
      pendingTestSave.current = null;
      return;
    }
    pendingTestSave.current = { id: modalTestMark.id, description };
    const timer = window.setTimeout(() => {
      updateTestMark(modalTestMark.id, { description });
      pendingTestSave.current = null;
    }, 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testDraft, modalTestMark?.id, modalTestMark?.description]);

  // When switching tabs or changing week offsets, fetch corresponding timetable if needed
  React.useEffect(() => {
    setFetchError(false);
    let cancelled = false;

    const performFetch = async () => {
      try {
        if (activeTab === 'permanent') {
          const hasPermLessons = permanentTimetable.days.some((d) => d.atoms && d.atoms.length > 0);
          if (!hasPermLessons) {
            await fetchTimetable(undefined, true);
          }
        } else {
          const targetIso = weekOffset !== 0 ? getMondayIso(weekOffset) : undefined;
          const d = getAppDate();
          const isWk = d.getDay() === 0 || d.getDay() === 6;
          const mondayIso = targetIso || (isWk ? getMondayIso(0) : undefined);
          const result = await fetchTimetable(mondayIso, false);
          if (!cancelled && weekOffset !== 0) {
            const expectedMonday = getMondayIso(weekOffset);
            const resMonday =
              result?.days?.find((day) => day.dayOfWeek === 1 || day.dayOfWeekName === 'Pondělí') ||
              result?.days?.[0];
            const resMondayIso = resMonday?.date ? resMonday.date.split('T')[0] : '';
            if (resMondayIso && resMondayIso !== expectedMonday) {
              setFetchError(true);
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setFetchError(true);
        }
      }
    };

    performFetch();

    return () => {
      cancelled = true;
    };
  }, [activeTab, weekOffset]);

  // Which timetable dataset to render
  const currentTimetableData = React.useMemo(() => {
    let baseData: TimetableData;
    if (activeTab === 'permanent') {
      baseData = permanentTimetable.days.length > 0 ? permanentTimetable : timetable;
    } else {
      const targetMondayIso = getMondayIso(weekOffset);
      const loadedMonday =
        timetable.days?.find((d) => d.dayOfWeek === 1 || d.dayOfWeekName === 'Pondělí') ||
        timetable.days?.[0];
      const loadedMondayIso = loadedMonday?.date ? loadedMonday.date.split('T')[0] : '';
      let activeWeekDataset = timetable;
      if (loadedMondayIso !== targetMondayIso) {
        const cached = getCachedTimetableWeek(weekOffset !== 0 ? targetMondayIso : undefined);
        if (cached && cached.days && cached.days.length > 0) {
          activeWeekDataset = cached;
        }
      }

      // If viewing current week (offset 0) and actual timetable is empty (e.g. before school year), fallback to permanent timetable
      // BUT do NOT fallback if actual timetable has holidays (e.g. state holidays / school break)!
      const actualLessons = (activeWeekDataset.days || []).reduce((acc, d) => acc + (d.atoms?.length || 0), 0);
      const isHolidaysInActual = (activeWeekDataset.days || []).some((d) => getHolidayInfo(d).isHoliday);
      if (actualLessons === 0 && weekOffset === 0 && !isHolidaysInActual) {
        const permLessons = (permanentTimetable.days || []).reduce((acc, d) => acc + (d.atoms?.length || 0), 0);
        if (permLessons > 0) {
          baseData = permanentTimetable;
        } else {
          baseData = activeWeekDataset;
        }
      } else {
        baseData = activeWeekDataset;
      }
    }

    // When in permanent mode, clear dates (as permanent timetable is a generic template) and filter atoms according to the active cycle toggle
    if (activeTab === 'permanent') {
      const filteredDays = (baseData.days || []).map((day) => ({
        ...day,
        date: '',
        atoms: (day.atoms || []).filter((atom) => {
          if (!atom.cycle || atom.cycle === 'both') {
            return true;
          }
          return atom.cycle === permanentCycle;
        }),
      }));
      return {
        ...baseData,
        days: filteredDays,
      };
    }

    return baseData;
  }, [activeTab, permanentTimetable, timetable, weekOffset, permanentCycle, getCachedTimetableWeek]);

  const isShowingFallbackBanner = React.useMemo(() => {
    if (activeTab !== 'current' || weekOffset !== 0 || isTimetableLoading) return false;
    const actualLessons = (timetable.days || []).reduce((acc, d) => acc + (d.atoms?.length || 0), 0);
    const isHolidaysInActual = (timetable.days || []).some((d) => getHolidayInfo(d).isHoliday);
    if (isHolidaysInActual) return false;
    const permLessons = (permanentTimetable.days || []).reduce((acc, d) => acc + (d.atoms?.length || 0), 0);
    return actualLessons === 0 && permLessons > 0;
  }, [activeTab, weekOffset, timetable, permanentTimetable, isTimetableLoading]);

  // Dynamic formatted Czech date range for the active week offset in navigation
  const currentWeekDateRangeLabel = React.useMemo(() => {
    if (activeTab === 'permanent') {
      return t('permanentSchedule');
    }
    const targetMondayDate = getRelevantSchoolWeekMonday(getAppDate(), weekOffset);
    const targetFridayDate = new Date(targetMondayDate);
    targetFridayDate.setDate(targetMondayDate.getDate() + 4);
    return formatCzechDateRange(targetMondayDate, targetFridayDate);
  }, [activeTab, weekOffset, t]);

  // Determine if the timetable currently in the store or cache belongs to the selected week offset
  const isTimetableForCurrentWeekReady = React.useMemo(() => {
    if (activeTab === 'permanent') {
      return permanentTimetable.days.length > 0;
    }
    if (isShowingFallbackBanner) {
      return true;
    }
    const targetMondayIso = getMondayIso(weekOffset);
    const loadedMonday =
      timetable.days?.find((d) => d.dayOfWeek === 1 || d.dayOfWeekName === 'Pondělí') ||
      timetable.days?.[0];
    const loadedMondayIso = loadedMonday?.date ? loadedMonday.date.split('T')[0] : '';
    if (loadedMondayIso === targetMondayIso) {
      return true;
    }
    const cached = getCachedTimetableWeek(weekOffset !== 0 ? targetMondayIso : undefined);
    if (cached && cached.days && cached.days.length > 0) {
      return true;
    }
    return false;
  }, [activeTab, permanentTimetable.days.length, isShowingFallbackBanner, weekOffset, timetable, getCachedTimetableWeek]);

  // Active loading state: true when fetching or when data does not match the active week yet
  const isLoading = (isTimetableLoading || !isTimetableForCurrentWeekReady) && !fetchError;

  // Watchdog: If the view for the active week is not ready and no fetch is currently running, trigger targeted fetch
  React.useEffect(() => {
    if (activeTab === 'current' && !isTimetableForCurrentWeekReady && !isTimetableLoading && !fetchError) {
      const targetIso = weekOffset !== 0 ? getMondayIso(weekOffset) : undefined;
      const d = getAppDate();
      const isWk = d.getDay() === 0 || d.getDay() === 6;
      const mondayIso = targetIso || (isWk ? getMondayIso(0) : undefined);
      loadTimetable(mondayIso, false);
    }
  }, [activeTab, isTimetableForCurrentWeekReady, isTimetableLoading, fetchError, weekOffset, fetchTimetable]);

  // A successful full refresh (server is back) lifts an earlier error so the week is looked at again.
  const lastUpdated = useDataStore((s) => s.lastUpdated);
  React.useEffect(() => {
    setFetchError(false);
  }, [lastUpdated]);

  // Check if any day in active view is a holiday (state holiday, school holiday, or director's day off)
  const hasHolidaysInView = React.useMemo(() => {
    return (currentTimetableData.days || []).some((d) => getHolidayInfo(d).isHoliday);
  }, [currentTimetableData]);

  // Total scheduled lessons in active view
  const totalLessonsInView = React.useMemo(() => {
    return (currentTimetableData.days || []).reduce(
      (acc, d) => acc + (d.atoms?.length || 0),
      0
    );
  }, [currentTimetableData]);

  // Helper to format week label
  const getWeekLabel = (offset: number) => {
    const d = getAppDate();
    const isWk = d.getDay() === 0 || d.getDay() === 6;
    if (isWk) {
      if (offset === 0) return t('nextWeek');
      if (offset === -1) return t('currentWeek');
      if (offset === -2) return t('previousWeek');
      return offset > 0
        ? t('weeksOffsetPlus', { count: offset + 1 })
        : t('weeksOffsetMinus', { count: Math.abs(offset) });
    }
    if (offset === 0) return t('currentWeek');
    if (offset === -1) return t('previousWeek');
    if (offset === 1) return t('nextWeek');
    return offset > 0 ? t('weeksOffsetPlus', { count: offset }) : t('weeksOffsetMinus', { count: offset });
  };

  // Base list of all hours defined by school or fallback to 1..8
  const allHours = currentTimetableData.hours && currentTimetableData.hours.length > 0
    ? currentTimetableData.hours
    : [1, 2, 3, 4, 5, 6, 7, 8].map((h) => ({
        id: h,
        caption: `${h}`,
        beginTime: `${7 + h}:00`,
        endTime: `${7 + h}:45`,
      }));

  // Dynamic clever hours: find min and max hourId with scheduled lessons across the week
  const effectiveHours = React.useMemo(() => {
    let minHour = Infinity;
    let maxHour = -Infinity;

    currentTimetableData.days.forEach((day) => {
      day.atoms?.forEach((atom) => {
        if (atom.hourId < minHour) minHour = atom.hourId;
        if (atom.hourId > maxHour) maxHour = atom.hourId;
      });
    });

    // Fallback if no lessons are recorded across the week
    if (!isFinite(minHour) || !isFinite(maxHour)) {
      return allHours.slice(0, 6);
    }

    // Clip strictly to the scheduled range: "0. hodina" (or any other edge hour
    // the school defines but never schedules) shows only when a lesson really
    // sits in it.
    return allHours.filter((h) => h.id >= minHour && h.id <= maxHour);
  }, [currentTimetableData, allHours]);

  const selectedDay = currentTimetableData.days[selectedDayIndex] || currentTimetableData.days[0];

  // Re-check current time on interval
  const [currentDate, setCurrentDate] = useState<Date>(() => getAppDate());
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(getAppDate());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const todayIso = React.useMemo(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [currentDate]);

  const todayJs = currentDate.getDay();
  const isWeekend = todayJs === 0 || todayJs === 6;
  const currentDayOfWeek = todayJs >= 1 && todayJs <= 5 ? todayJs : 1;

  // Is it currently a weekday where current time is relevant?
  // Relevant for both actual week (weekOffset === 0) AND permanent timetable!
  const isCurrentTimeRelevant = !isWeekend && (activeTab === 'permanent' || weekOffset === 0);

  // Today's day index within the rendered week (-1 = no highlight: other week, weekend)
  const todayColumnIndex =
    isCurrentTimeRelevant
      ? currentTimetableData.days.findIndex(
          (d) => (d.date && d.date === todayIso) || d.dayOfWeek === currentDayOfWeek
        )
      : -1;

  const isTodayDay = (day: TimetableDay) => {
    if (!isCurrentTimeRelevant) return false;
    if (day.date) return day.date === todayIso;
    return day.dayOfWeek === currentDayOfWeek;
  };

  // Currently active lesson hour
  const currentHour = React.useMemo(() => {
    if (!isCurrentTimeRelevant) {
      return undefined;
    }
    return getCurrentTimetableHour(effectiveHours, currentDate);
  }, [isCurrentTimeRelevant, effectiveHours, currentDate]);

  const currentHourId = currentHour?.id;
  const isCurrentHourActive = currentHourId !== undefined;

  // Current progress (0..1) through the active hour
  const hourProgress = React.useMemo(() => {
    return getTimetableHourProgress(currentHour, currentDate);
  }, [currentHour, currentDate]);

  // Index of the currently active hour in effectiveHours
  const currentHourIndex = React.useMemo(() => {
    if (!isCurrentHourActive) return -1;
    return effectiveHours.findIndex((h) => Number(h.id) === Number(currentHourId));
  }, [isCurrentHourActive, effectiveHours, currentHourId]);

  // Resolve active hour and next hour for auto-scroll
  const { activeHour, nextHour } = React.useMemo(() => {
    if (!isCurrentTimeRelevant || effectiveHours.length === 0) {
      return { activeHour: undefined, nextHour: undefined };
    }

    const nowMin = currentDate.getHours() * 60 + currentDate.getMinutes();

    // 1. Check if currently inside an ongoing lesson
    const ongoingIdx = effectiveHours.findIndex((h) => {
      const b = parseTimeToMinutes(h.beginTime);
      const e = parseTimeToMinutes(h.endTime);
      return b !== null && e !== null && nowMin >= b && nowMin <= e;
    });

    if (ongoingIdx >= 0) {
      return {
        activeHour: effectiveHours[ongoingIdx],
        nextHour: ongoingIdx + 1 < effectiveHours.length ? effectiveHours[ongoingIdx + 1] : undefined,
      };
    }

    // 2. Not in lesson: break between lessons or before school
    // When it's a break, show the 2 upcoming lessons
    const upcomingIdx = effectiveHours.findIndex((h) => {
      const b = parseTimeToMinutes(h.beginTime);
      return b !== null && nowMin < b;
    });

    if (upcomingIdx >= 0) {
      return {
        activeHour: effectiveHours[upcomingIdx],
        nextHour: upcomingIdx + 1 < effectiveHours.length ? effectiveHours[upcomingIdx + 1] : undefined,
      };
    }

    // School is over for today -> show last lesson
    return {
      activeHour: effectiveHours[effectiveHours.length - 1],
      nextHour: undefined,
    };
  }, [isCurrentTimeRelevant, effectiveHours, currentDate]);

  const targetHour = activeHour;

  const matrixContainerRef = React.useRef<HTMLDivElement>(null);
  const horizontalScrollRef = React.useRef<HTMLDivElement>(null);
  const dayViewGridRef = React.useRef<HTMLDivElement>(null);
  const lastAutoScrolledKey = React.useRef<string>('');

  // Automatically scroll timetable so that the current running lesson and next lesson (or 2 upcoming lessons during break) are in view
  React.useEffect(() => {
    if (!activeHour || totalLessonsInView === 0) return;

    const scrollKey = `${activeTab}_${weekOffset}_${timetableLayout}_${activeHour.id}_${selectedDayIndex}`;
    if (lastAutoScrolledKey.current === scrollKey) return;

    const timer = setTimeout(() => {
      // 1. Horizontal Table layout
      if (timetableLayout === 'horizontal' && horizontalScrollRef.current) {
        const container = horizontalScrollRef.current;
        const activeHeader = container.querySelector(
          `[data-table-hour-header="${activeHour.id}"]`
        ) as HTMLElement | null;
        const nextHeader = nextHour
          ? (container.querySelector(`[data-table-hour-header="${nextHour.id}"]`) as HTMLElement | null)
          : null;

        if (activeHeader) {
          const stickyEl = container.querySelector('.sticky');
          const stickyWidth = stickyEl ? stickyEl.getBoundingClientRect().width : (window.innerWidth >= 640 ? 80 : 64);
          const containerWidth = container.clientWidth;
          const currentScroll = container.scrollLeft;

          const aLeft = activeHeader.offsetLeft;
          const aRight = aLeft + activeHeader.offsetWidth;

          const nRight = nextHeader ? nextHeader.offsetLeft + nextHeader.offsetWidth : aRight;

          // Both are visible if they fall strictly between sticky column and container right edge
          const isBothVisible = aLeft >= currentScroll + stickyWidth && nRight <= currentScroll + containerWidth;

          if (!isBothVisible) {
            // Align active header right next to sticky edge (+ 8px margin),
            // so both target lessons are side-by-side in full view
            const targetLeft = Math.max(0, aLeft - stickyWidth - 8);
            if (Math.abs(container.scrollLeft - targetLeft) > 4) {
              container.scrollTo({ left: targetLeft, behavior: 'smooth' });
            }
          }
        }

        // Keep today's row in vertical view if partially offscreen
        const todayRow = container.querySelector('[data-table-day-row="today"]') as HTMLElement | null;
        if (todayRow) {
          const rect = todayRow.getBoundingClientRect();
          const topLimit = 72;
          const bottomLimit = window.innerHeight - (window.innerWidth < 640 ? 76 : 30);
          if (rect.bottom > bottomLimit || rect.top < topLimit) {
            let targetY = window.scrollY;
            if (rect.top < topLimit) {
              targetY = Math.max(0, window.scrollY - (topLimit - rect.top + 8));
            } else if (rect.bottom > bottomLimit) {
              targetY = Math.max(0, window.scrollY + (rect.bottom - bottomLimit + 16));
            }
            if (Math.abs(targetY - window.scrollY) > 4) {
              window.scrollTo({ top: targetY, behavior: 'smooth' });
            }
          }
        }
        lastAutoScrolledKey.current = scrollKey;
      }

      // 2. Vertical Matrix layout
      if (timetableLayout === 'vertical' && matrixContainerRef.current) {
        const container = matrixContainerRef.current;
        const currentRow = container.querySelector(
          `[data-matrix-hour-row="${activeHour.id}"]`
        ) as HTMLElement | null;
        const nextRowEl = nextHour
          ? (container.querySelector(`[data-matrix-hour-row="${nextHour.id}"]`) as HTMLElement | null)
          : null;

        if (currentRow) {
          const topLimit = 114;
          const bottomLimit = window.innerHeight - (window.innerWidth < 640 ? 76 : 30);
          const cRect = currentRow.getBoundingClientRect();
          const nRect = (nextRowEl || currentRow).getBoundingClientRect();

          const isBothVisible = cRect.top >= topLimit && nRect.bottom <= bottomLimit;
          if (!isBothVisible) {
            // Position currentRow cleanly below the sticky day headers (~120px from top)
            const targetY = Math.max(0, window.scrollY + cRect.top - 120);
            if (Math.abs(targetY - window.scrollY) > 4) {
              window.scrollTo({ top: targetY, behavior: 'smooth' });
            }
          }
        }
        lastAutoScrolledKey.current = scrollKey;
      }

      // 3. Day View layout (only when viewing today)
      if (timetableLayout === 'day' && dayViewGridRef.current && selectedDay && isTodayDay(selectedDay)) {
        const container = dayViewGridRef.current;
        const currentCard = container.querySelector(
          `[data-day-hour-card="${activeHour.id}"]`
        ) as HTMLElement | null;
        const nextCard = nextHour
          ? (container.querySelector(`[data-day-hour-card="${nextHour.id}"]`) as HTMLElement | null)
          : null;

        if (currentCard) {
          const topLimit = 72;
          const bottomLimit = window.innerHeight - (window.innerWidth < 640 ? 76 : 30);
          const cRect = currentCard.getBoundingClientRect();
          const nRect = (nextCard || currentCard).getBoundingClientRect();

          const isBothVisible = cRect.top >= topLimit && nRect.bottom <= bottomLimit;
          if (!isBothVisible) {
            const targetY = Math.max(0, window.scrollY + cRect.top - 84);
            if (Math.abs(targetY - window.scrollY) > 4) {
              window.scrollTo({ top: targetY, behavior: 'smooth' });
            }
          }
        }
        lastAutoScrolledKey.current = scrollKey;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [activeHour, nextHour, timetableLayout, activeTab, weekOffset, selectedDayIndex, selectedDay, totalLessonsInView]);

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-5 flex flex-col gap-5">
      {/* 1. Page Header & View Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-m3-on-surface">
            {t('timetable')}
          </h1>
          <p className="text-xs sm:text-sm text-m3-on-surface-variant font-medium">
            {activeTab === 'current'
              ? t('currentWeekSub')
              : t('permanentWeekSub')}
          </p>
        </div>

        <div className="w-full md:w-auto flex flex-wrap items-center justify-between gap-2 md:gap-3">
          {/* Tab switcher: Current vs Permanent */}
          <div className="flex items-center p-1 rounded-full bg-m3-surface-container gap-0.5 shrink-0">
            <button
              onClick={() => handleTabChange('current')}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold font-display transition-all m3-pressable ${
                activeTab === 'current'
                  ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                  : 'text-m3-on-surface-variant hover:text-m3-on-surface'
              }`}
            >
              {t('tabCurrentWeek')}
            </button>
            <button
              onClick={() => handleTabChange('permanent')}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold font-display transition-all m3-pressable ${
                activeTab === 'permanent'
                  ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                  : 'text-m3-on-surface-variant hover:text-m3-on-surface'
              }`}
            >
              {t('tabPermanent')}
            </button>
          </div>

          {/* View mode toggle: Vertical / Horizontal / Day */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto md:ml-0">
            <span className="text-xs font-semibold font-display text-m3-on-surface-variant select-none">
              {t('viewLayoutLabel')}
            </span>
            <div className="flex items-center p-1 rounded-full bg-m3-surface-container gap-0.5">
              <button
                onClick={() => setTimetableLayout('vertical')}
                title={t('viewMatrixTitle')}
                aria-label={t('viewMatrix')}
                className={`w-7 h-7 flex items-center justify-center rounded-full transition-all m3-pressable shrink-0 ${
                  timetableLayout === 'vertical'
                    ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                    : 'text-m3-on-surface-variant hover:text-m3-on-surface'
                }`}
              >
                <Columns3 className="w-4 h-4 shrink-0" />
              </button>

              <button
                onClick={() => setTimetableLayout('horizontal')}
                title={t('viewHorizontalTitle')}
                aria-label={t('viewHorizontal')}
                className={`w-7 h-7 flex items-center justify-center rounded-full transition-all m3-pressable shrink-0 ${
                  timetableLayout === 'horizontal'
                    ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                    : 'text-m3-on-surface-variant hover:text-m3-on-surface'
                }`}
              >
                <Rows3 className="w-4 h-4 shrink-0" />
              </button>

              <button
                onClick={() => setTimetableLayout('day')}
                title={t('viewDayTitle')}
                aria-label={t('viewDay')}
                className={`w-7 h-7 flex items-center justify-center rounded-full transition-all m3-pressable shrink-0 ${
                  timetableLayout === 'day'
                    ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                    : 'text-m3-on-surface-variant hover:text-m3-on-surface'
                }`}
              >
                <CalendarDays className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Week Navigator (When in Current Week tab) */}
      {activeTab === 'current' && (
        <div className="h-[60px] sm:h-[68px] px-3 sm:px-3.5 rounded-m3-2xl bg-m3-surface-container grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 shadow-xs">
          {/* Left Controls */}
          <div className="flex items-center justify-start gap-1.5 min-w-0">
            <button
              onClick={() => handleWeekOffsetChange(weekOffset - 1)}
              className="w-9 sm:w-10 h-9 sm:h-10 rounded-full bg-m3-surface-container-high hover:bg-m3-primary hover:text-m3-on-primary flex items-center justify-center text-m3-on-surface transition-colors m3-pressable shrink-0"
              title={t('previousWeek')}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {weekOffset > 0 && (
              <button
                onClick={() => handleWeekOffsetChange(0)}
                className="w-9 sm:w-10 h-9 sm:h-10 rounded-full bg-m3-surface-container-high hover:bg-m3-primary hover:text-m3-on-primary flex items-center justify-center text-m3-on-surface transition-colors m3-pressable shrink-0"
                title={t('currentWeek')}
              >
                <ChevronsLeft className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Center Info */}
          <div className="flex flex-col items-center justify-center text-center px-1 min-w-0">
            <span className="text-xs sm:text-sm font-extrabold font-display text-m3-on-surface truncate max-w-full">
              {getWeekLabel(weekOffset)}
            </span>
            <span className="text-[11px] text-m3-on-surface-variant font-medium truncate max-w-full">
              {currentWeekDateRangeLabel}
            </span>
          </div>

          {/* Right Controls */}
          <div className="flex items-center justify-end gap-1.5 min-w-0">
            {weekOffset < 0 && (
              <button
                onClick={() => handleWeekOffsetChange(0)}
                className="w-9 sm:w-10 h-9 sm:h-10 rounded-full bg-m3-surface-container-high hover:bg-m3-primary hover:text-m3-on-primary flex items-center justify-center text-m3-on-surface transition-colors m3-pressable shrink-0"
                title={t('currentWeek')}
              >
                <ChevronsRight className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={() => handleWeekOffsetChange(weekOffset + 1)}
              className="w-9 sm:w-10 h-9 sm:h-10 rounded-full bg-m3-surface-container-high hover:bg-m3-primary hover:text-m3-on-primary flex items-center justify-center text-m3-on-surface transition-colors m3-pressable shrink-0"
              title={t('nextWeek')}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 2B. Permanent Week Cycle Switch (Lichý / Sudý týden) */}
      {activeTab === 'permanent' && (
        <div className="h-[60px] sm:h-[68px] p-1.5 sm:p-2 rounded-m3-2xl bg-m3-surface-container grid grid-cols-2 gap-2 shadow-xs">
          <button
            type="button"
            onClick={() => setPermanentCycle('odd')}
            className={`h-full rounded-full text-xs sm:text-sm font-extrabold font-display transition-all m3-pressable flex items-center justify-center ${
              permanentCycle === 'odd'
                ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                : 'bg-m3-surface-container-high/60 hover:bg-m3-surface-container-high text-m3-on-surface-variant hover:text-m3-on-surface'
            }`}
          >
            {t('oddWeek')}
          </button>

          <button
            type="button"
            onClick={() => setPermanentCycle('even')}
            className={`h-full rounded-full text-xs sm:text-sm font-extrabold font-display transition-all m3-pressable flex items-center justify-center ${
              permanentCycle === 'even'
                ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                : 'bg-m3-surface-container-high/60 hover:bg-m3-surface-container-high text-m3-on-surface-variant hover:text-m3-on-surface'
            }`}
          >
            {t('evenWeek')}
          </button>
        </div>
      )}

      {/* Fallback Banner when showing permanent schedule during empty actual week */}
      {!isLoading && !fetchError && isShowingFallbackBanner && (
        <div className="p-3.5 sm:p-4 rounded-m3-2xl bg-m3-surface-container flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2.5 text-m3-on-surface">
            <div className="w-8 h-8 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold font-display block text-m3-on-surface">
                {t('showingPermanentNotice')}
              </span>
              <p className="text-m3-on-surface-variant text-[11px] font-medium">
                {t('noLessonsThisWeek')}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleWeekOffsetChange(1)}
            className="px-3.5 py-1.5 rounded-full bg-m3-primary text-m3-on-primary font-bold font-display text-xs shrink-0 m3-pressable flex items-center gap-1 shadow-xs"
          >
            <span>{t('goToNextWeek')}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Loading indicator with Material shapes spinning animation while timetable is loading */}
      {isLoading && (
        <div className="p-12 rounded-m3-3xl bg-m3-surface-container flex flex-col items-center justify-center text-center gap-4 min-h-[360px] animate-in fade-in duration-150 shadow-xs">
          <MaterialMorphingLoader size={48} className="h-12 w-12 text-m3-primary" />
          <span className="text-xs font-bold font-display text-m3-on-surface-variant/80 tracking-wide">
            {t('loading')}
          </span>
        </div>
      )}

      {/* Error state if week fetch failed */}
      {!isLoading && fetchError && (
        <div className="p-8 rounded-m3-3xl bg-m3-surface-container flex flex-col items-center justify-center text-center gap-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-500">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="flex flex-col gap-1 max-w-sm">
            <h3 className="text-base font-extrabold font-display text-m3-on-surface">
              {t('error')}
            </h3>
            <p className="text-xs text-m3-on-surface-variant font-medium">
              Nepodařilo se načíst rozvrh pro vybraný týden. Zkontrolujte připojení.
            </p>
          </div>
          <button
            onClick={() => {
              setFetchError(false);
              const targetIso = weekOffset !== 0 ? getMondayIso(weekOffset) : undefined;
              const d = getAppDate();
              const isWk = d.getDay() === 0 || d.getDay() === 6;
              const mondayIso = targetIso || (isWk ? getMondayIso(0) : undefined);
              loadTimetable(mondayIso, false);
            }}
            className="px-4 py-2 rounded-full bg-m3-primary text-m3-on-primary text-xs font-bold font-display m3-pressable shadow-xs mt-1"
          >
            {t('retry')}
          </button>
        </div>
      )}

      {/* Notice if this entire week has holidays / vacation and no scheduled lessons */}
      {!isLoading && !fetchError && totalLessonsInView === 0 && hasHolidaysInView && (
        <div className="p-4 sm:p-5 rounded-m3-2xl bg-sky-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-3 text-m3-on-surface">
            <div className="w-10 h-10 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 shadow-xs">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold font-display block text-m3-on-surface text-sm sm:text-base">
                {t('holidayWeekNotice')}
              </span>
              <p className="text-m3-on-surface-variant text-[11px] sm:text-xs font-medium mt-0.5">
                {t('dayOffNotice')} • {t('enjoyFreeDay')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              onClick={() => handleTabChange('permanent')}
              className="px-3.5 py-1.5 rounded-full bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface text-xs font-bold font-display m3-pressable flex items-center gap-1.5 shadow-xs"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t('showPermanentSchedule')}</span>
            </button>
            <button
              onClick={() => handleWeekOffsetChange(weekOffset + 1)}
              className="px-3.5 py-1.5 rounded-full bg-m3-primary text-m3-on-primary text-xs font-bold font-display m3-pressable flex items-center gap-1 shadow-xs"
            >
              <span>{t('nextWeekShort')}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Notice if this week has no scheduled lessons (and no holidays either) */}
      {!isLoading && !fetchError && totalLessonsInView === 0 && !hasHolidaysInView && (
        <div className="p-6 rounded-m3-3xl bg-m3-surface-container flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-m3-surface-container-high flex items-center justify-center text-m3-primary">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div className="flex flex-col gap-1 max-w-md">
            <h3 className="text-base font-extrabold font-display text-m3-on-surface">
              {activeTab === 'current' ? t('noLessonsInWeekTitle') : t('emptyPermanentTitle')}
            </h3>
            <p className="text-xs text-m3-on-surface-variant font-medium">
              {activeTab === 'current'
                ? t('noLessonsInWeekDesc')
                : t('emptyPermanentDesc')}
            </p>
          </div>
          {activeTab === 'current' && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              <button
                onClick={() => handleTabChange('permanent')}
                className="px-4 py-2 rounded-full bg-m3-primary text-m3-on-primary text-xs font-bold font-display m3-pressable flex items-center gap-1.5 shadow-xs"
              >
                <Layers className="w-4 h-4" />
                <span>{t('showPermanentSchedule')}</span>
              </button>
              <button
                onClick={() => handleWeekOffsetChange(weekOffset + 1)}
                className="px-4 py-2 rounded-full bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface text-xs font-bold font-display m3-pressable flex items-center gap-1.5"
              >
                <span>{t('nextWeekShort')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3A. VIEW MODE 1: VERTICAL MATRIX (Days on X-axis, Hours on Y-axis) */}
      {!isLoading && !fetchError && timetableLayout === 'vertical' && (totalLessonsInView > 0 || hasHolidaysInView) && (
        <div ref={matrixContainerRef} className="p-3 sm:p-5 rounded-m3-3xl bg-m3-surface-container shadow-xs">
          <div className="relative flex flex-col gap-3">
            {/* Today's day column: highlight band that wraps today's scheduled hours */}
            {todayColumnIndex >= 0 && <TimetableHighlightBand cellSelector="[data-today-cell]" />}

            {/* Header Row: Time Label + 5 Day Columns (sticky under top app bar) */}
            <div className="top-below-app-bar sticky z-20 bg-m3-surface-container py-1 -my-1 grid grid-cols-[38px_repeat(5,minmax(0,1fr))] sm:grid-cols-[64px_repeat(5,minmax(0,1fr))] gap-1.5 sm:gap-2">
            {/* Empty corner gutter */}
            <div className="flex items-center justify-center text-[10px] sm:text-xs font-black font-display text-m3-on-surface-variant/70 min-w-0">
              <Clock className="w-3.5 h-3.5 text-m3-primary" />
            </div>

            {/* 5 Day Header Columns */}
            {currentTimetableData.days.map((day) => {
              const isToday = isTodayDay(day);
              const holiday = getHolidayInfo(day);
              return (
                <div
                  key={day.dayOfWeek}
                  onClick={() => holiday.isHoliday && setActiveHolidayModal({ day, holiday })}
                  className={`py-2 px-1 rounded-m3-xl flex flex-col items-center justify-center text-center transition-all min-w-0 overflow-hidden ${
                    holiday.isHoliday ? 'cursor-pointer hover:brightness-105' : ''
                  } ${
                    isToday
                      ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                      : holiday.isHoliday
                      ? 'bg-sky-500/15 text-m3-on-surface'
                      : 'bg-m3-surface-container-high text-m3-on-surface'
                  }`}
                >
                  <span className="text-xs sm:text-sm font-black font-display leading-tight truncate w-full">
                    {getDayOfWeekName(day.dayOfWeek || day.dayOfWeekName, undefined, true)}
                  </span>
                  <span className="text-[9px] sm:text-[11px] font-bold opacity-85 leading-tight truncate w-full">
                    {day.date ? formatCzechDate(day.date, 'short') : t('permanentScheduleShort')}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Matrix Rows: Dynamic Scheduled Lesson Hours */}
          <div className="relative z-10 flex flex-col gap-1.5 sm:gap-2">
            {effectiveHours.map((hour, hourIdx) => {
              const isHourCurrent = isCurrentHourActive && Number(hour.id) === Number(currentHourId);
              return (
                <div
                  key={hour.id}
                  data-matrix-hour-row={hour.id}
                  className="relative grid grid-cols-[38px_repeat(5,minmax(0,1fr))] sm:grid-cols-[64px_repeat(5,minmax(0,1fr))] gap-1.5 sm:gap-2 items-stretch"
                >
                  {/* Left Time Gutter */}
                  <div
                    className={`flex flex-col items-center justify-center rounded-m3-xl px-0.5 py-1 text-center select-none min-w-0 transition-all ${
                      isHourCurrent
                        ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                        : 'bg-m3-surface-container-high/60 text-m3-on-surface'
                    }`}
                  >
                    <span
                      className={`text-xs sm:text-sm font-black font-display leading-none ${
                        isHourCurrent ? 'text-m3-on-primary' : 'text-m3-on-surface'
                      }`}
                    >
                      {hour.caption}.
                    </span>
                    <span
                      className={`text-[8px] sm:text-[10px] font-semibold mt-0.5 leading-tight hidden sm:block ${
                        isHourCurrent ? 'text-m3-on-primary/90' : 'text-m3-on-surface-variant/80'
                      }`}
                    >
                      {hour.beginTime}
                    </span>
                  </div>

                  {/* 5 Day Cells for this Hour */}
                  {currentTimetableData.days.map((day, dayIdx) => {
                    const lesson = day.atoms?.find((a) => Number(a.hourId) === Number(hour.id));
                    const isCellToday = isTodayDay(day);
                    const holiday = getHolidayInfo(day);
                    const isDayHoliday = holiday.isHoliday && (!day.atoms || day.atoms.length === 0);

                    if (isDayHoliday) {
                      return (
                        <div
                          key={`${day.dayOfWeek}-${hour.id}`}
                          onClick={() => setActiveHolidayModal({ day, holiday })}
                          title={`${holiday.badgeLabel}: ${holiday.title}`}
                          style={{ containerType: 'inline-size' }}
                          className="relative h-full min-w-0 min-h-[72px] sm:min-h-[78px] rounded-m3-xl p-1 sm:p-1.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all shadow-xs select-none overflow-hidden bg-gradient-to-b from-sky-500/15 via-sky-500/8 to-sky-500/15 hover:bg-sky-500/20"
                        >
                          {hourIdx === 0 && (
                            <span
                              lang={lang}
                              style={{ fontSize: fitWordFontSize(holiday.badgeLabel, 0.8, 7, 10) }}
                              className="w-full font-black uppercase tracking-wider leading-tight text-balance line-clamp-2 [overflow-wrap:anywhere] text-sky-700 dark:text-sky-300"
                            >
                              {holiday.badgeLabel}
                            </span>
                          )}
                          {hourIdx === 1 && (
                            <span
                              lang={lang}
                              style={{ fontSize: fitWordFontSize(holiday.title, 0.62, 7, 12) }}
                              className="w-full font-black text-center text-m3-on-surface line-clamp-4 leading-snug hyphens-auto [overflow-wrap:anywhere] font-display"
                            >
                              {holiday.title}
                            </span>
                          )}
                          {hourIdx === 2 && (
                            <span className="w-full text-[8px] sm:text-[9px] font-bold text-m3-on-surface-variant/80 text-center leading-tight [overflow-wrap:anywhere]">
                              {t('dayOffNotice')}
                            </span>
                          )}
                          {hourIdx >= 3 && (
                            <span className="text-sm sm:text-base font-bold select-none leading-none text-sky-700/60 dark:text-sky-300/60">
                              -
                            </span>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`${day.dayOfWeek}-${hour.id}`}
                        data-today-cell={isCellToday && lesson ? 'true' : undefined}
                        className="relative h-full min-w-0"
                      >
                        <LessonCard
                          lesson={lesson}
                          hour={hour}
                          variant="matrix"
                          isOngoing={isCellToday && isHourCurrent}
                          testMark={activeTab === 'permanent' ? undefined : testMarkFor(day.date, hour.id)}
                          onClick={() => lesson && openLessonModal(lesson, hour, day)}
                        />

                        {/* Grid intersection dot where 4 classes' corners touch */}
                        {dayIdx < 4 && hourIdx < effectiveHours.length - 1 && (
                          <div
                            className="absolute -bottom-[4.5px] -right-[4.5px] sm:-bottom-[5px] sm:-right-[5px] w-2 h-2 rounded-full bg-m3-outline-variant/70 dark:bg-m3-outline-variant/50 flex items-center justify-center pointer-events-none z-20"
                          >
                            <div className="w-1 h-1 rounded-full bg-m3-primary/80" />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Straight horizontal timeline indicator for the active hour */}
                  {isHourCurrent && (
                    <div
                      className="absolute left-[38px] sm:left-[64px] right-0 z-30 pointer-events-none"
                      style={{
                        top: `clamp(4px, ${hourProgress * 100}%, calc(100% - 4px))`,
                      }}
                    >
                      <div className="w-full h-[2px] bg-m3-primary shadow-xs" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    )}

      {/* 3B. VIEW MODE 2: HORIZONTAL TABLE (Hours on X-axis, Days on Y-axis with synchronized horizontal scroll) */}
      {!isLoading && !fetchError && timetableLayout === 'horizontal' && (totalLessonsInView > 0 || hasHolidaysInView) && (
        <div className="p-3 sm:p-5 rounded-m3-3xl bg-m3-surface-container shadow-xs overflow-hidden flex flex-col gap-3 touch-pan-x touch-pan-y">
          <div ref={horizontalScrollRef} className="touch-scroll-x py-1.5 no-scrollbar [--hour-w:105px] sm:[--hour-w:118px]">
            <div className="relative flex flex-col gap-2 min-w-max">
              {/* Header Row: Corner Header + Hours */}
              <div className="flex items-center gap-2">
                {/* Corner Header */}
                <div className="sticky left-0 z-30 w-16 sm:w-20 bg-m3-surface-container pr-1 flex items-center justify-center shrink-0 -my-1 py-1">
                  <div className="w-full h-8 rounded-m3-lg bg-m3-surface-container-high/60 flex items-center justify-center text-m3-primary font-display font-black text-xs">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Hours Columns */}
                <div className="flex items-center gap-2">
                  {effectiveHours.map((hour) => {
                    const isHourCurrent = isCurrentHourActive && Number(hour.id) === Number(currentHourId);
                    return (
                      <div
                        key={hour.id}
                        data-table-hour-header={hour.id}
                        className={`relative w-[var(--hour-w)] h-8 flex flex-col items-center justify-center text-center shrink-0 transition-all rounded-m3-lg ${
                          isHourCurrent
                            ? 'bg-m3-primary text-m3-on-primary shadow-xs font-black'
                            : ''
                        }`}
                      >
                        <span
                          className={`text-xs font-black font-display leading-none ${
                            isHourCurrent ? 'text-m3-on-primary' : 'text-m3-on-surface'
                          }`}
                        >
                          {hour.caption}. hodina
                        </span>
                        <span
                          className={`text-[10px] font-medium leading-tight mt-0.5 ${
                            isHourCurrent ? 'text-m3-on-primary/90' : 'text-m3-on-surface-variant/80'
                          }`}
                        >
                          {formatHourTime(hour.beginTime)} – {formatHourTime(hour.endTime)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rows for Each Day */}
              {currentTimetableData.days.map((day, dayIdx) => {
                const isToday = isTodayDay(day);
                const holiday = getHolidayInfo(day);
                return (
                  <div
                    key={day.dayOfWeek}
                    data-table-day-row={isToday ? 'today' : undefined}
                    className="relative flex items-center gap-2"
                  >
                    {/* Today's row: highlight band that wraps today's scheduled hours */}
                    {isToday && (
                      <TimetableHighlightBand cellSelector="[data-today-cell]" />
                    )}

                    {/* Sticky Day Label */}
                    <div className="sticky left-0 z-20 w-16 sm:w-20 bg-m3-surface-container pr-1 shrink-0 -my-1 py-1">
                      <div
                        onClick={() => holiday.isHoliday && setActiveHolidayModal({ day, holiday })}
                        className={`w-full h-[74px] sm:h-[80px] rounded-m3-xl flex flex-col items-center justify-center gap-0.5 px-1 py-1 transition-all ${
                          holiday.isHoliday ? 'cursor-pointer hover:brightness-105' : ''
                        } ${
                          isToday
                            ? 'bg-m3-primary text-m3-on-primary font-black shadow-xs'
                            : holiday.isHoliday
                            ? 'bg-sky-500/15 text-m3-on-surface'
                            : 'bg-m3-surface-container-high text-m3-on-surface hover:bg-m3-surface-container-highest'
                        }`}
                      >
                        <span className="text-sm font-black font-display leading-tight">
                          {getDayOfWeekName(day.dayOfWeek || day.dayOfWeekName, undefined, true)}
                        </span>
                        <span className="text-[11px] font-bold opacity-85 leading-tight">
                          {day.date ? formatCzechDate(day.date, 'short') : t('permanentScheduleShort')}
                        </span>
                      </div>
                    </div>

                    {/* If holiday day with no lessons: full row banner */}
                    {day.atoms.length === 0 && holiday.isHoliday ? (
                      <div
                        onClick={() => setActiveHolidayModal({ day, holiday })}
                        className="relative h-[74px] sm:h-[80px] rounded-m3-xl px-4 sm:px-6 flex items-center justify-between gap-3 cursor-pointer transition-all select-none shadow-xs group bg-gradient-to-r from-sky-500/15 via-sky-500/10 to-sky-500/5 hover:bg-sky-500/20 shrink-0"
                        style={{
                          width: `calc(${effectiveHours.length} * var(--hour-w, 105px) + ${(effectiveHours.length - 1) * 8}px)`,
                          minWidth: '280px',
                        }}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform bg-sky-500/20 text-sky-600 dark:text-sky-400">
                            <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/25 text-sky-700 dark:text-sky-300">
                                {holiday.badgeLabel}
                              </span>
                              <span className="text-xs font-medium text-m3-on-surface-variant/80 hidden sm:inline">
                                {t('dayOffNotice')}
                              </span>
                            </div>
                            <h4 className="text-sm sm:text-base font-black font-display text-m3-on-surface truncate mt-0.5">
                              {holiday.title}
                            </h4>
                          </div>
                        </div>
                        <div className="shrink-0 text-xs font-bold group-hover:underline flex items-center gap-1 text-sky-600 dark:text-sky-400">
                          <span>{t('holidayDetails')}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>

                        {/* Straight vertical timeline indicator segment across free day banner */}
                        {isCurrentHourActive && currentHourIndex >= 0 && (
                          <div
                            className="absolute -top-1.5 -bottom-1.5 z-10 pointer-events-none -translate-x-1/2"
                            style={{
                              left: `calc(${currentHourIndex} * (var(--hour-w, 105px) + 8px) + clamp(6px, ${Number(hourProgress.toFixed(4))} * var(--hour-w, 105px), calc(var(--hour-w, 105px) - 6px)))`,
                            }}
                          >
                            <div className="w-[2px] h-full bg-m3-primary shadow-xs" />
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Lesson Cards for this Day */
                      <div className="relative flex items-center gap-2">
                        {effectiveHours.map((hour, hourIdx) => {
                          const lesson = day.atoms?.find((a) => Number(a.hourId) === Number(hour.id));
                          const isCellToday = isToday;
                          const isCellCurrentHour = isCurrentHourActive && Number(hour.id) === Number(currentHourId);
                          return (
                            <div
                              key={`${day.dayOfWeek}-${hour.id}`}
                              data-today-cell={isCellToday && lesson ? 'true' : undefined}
                              className="relative shrink-0 w-[var(--hour-w)]"
                            >
                              <LessonCard
                                lesson={lesson}
                                hour={hour}
                                variant="compact"
                                isOngoing={isCellToday && isCellCurrentHour}
                                testMark={activeTab === 'permanent' ? undefined : testMarkFor(day.date, hour.id)}
                                onClick={() => lesson && openLessonModal(lesson, hour, day)}
                              />

                              {/* Straight vertical timeline indicator segment for this active hour column */}
                              {isCellCurrentHour && (
                                <div
                                  className="absolute -top-1.5 -bottom-1.5 z-10 pointer-events-none -translate-x-1/2"
                                  style={{
                                    left: `clamp(6px, ${Number(hourProgress.toFixed(4))} * var(--hour-w, 105px), calc(var(--hour-w, 105px) - 6px))`,
                                  }}
                                >
                                  <div className="w-[2px] h-full bg-m3-primary shadow-xs" />
                                </div>
                              )}

                              {/* Grid intersection dot where 4 classes meet */}
                              {dayIdx < currentTimetableData.days.length - 1 && hourIdx < effectiveHours.length - 1 && (
                                <div className="absolute -bottom-[5px] -right-[5px] w-2 h-2 rounded-full bg-m3-outline-variant/70 dark:bg-m3-outline-variant/50 flex items-center justify-center pointer-events-none z-10">
                                  <div className="w-1 h-1 rounded-full bg-m3-primary/80" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3C. VIEW MODE 3: DETAILED DAY VIEW (Po, Út, St, Čt, Pá Chips + Large Cards) */}
      {!isLoading && !fetchError && timetableLayout === 'day' && (totalLessonsInView > 0 || hasHolidaysInView) && (
        <div className="flex flex-col gap-4">
          {/* Day Selector Chips */}
          <div className="flex items-center gap-2 touch-scroll-x pb-1 no-scrollbar">
            {currentTimetableData.days.map((day, idx) => {
              const isSelected = selectedDayIndex === idx;
              const isToday = isTodayDay(day);
              const hasChanges = day.atoms?.some((a) => a.hasChange && !a.change?.typeAbbrev);
              const holiday = getHolidayInfo(day);

              return (
                <button
                  key={day.dayOfWeek}
                  onClick={() => setSelectedDayIndex(idx)}
                  className={`flex-1 min-w-[72px] h-[58px] py-2 px-3 rounded-m3-xl font-display font-extrabold text-xs flex flex-col items-center justify-center gap-0.5 transition-all m3-pressable ${
                    isSelected
                      ? 'bg-m3-primary text-m3-on-primary shadow-sm scale-[1.02]'
                      : holiday.isHoliday
                      ? 'bg-sky-500/15 text-m3-on-surface'
                      : 'bg-m3-surface-container text-m3-on-surface hover:bg-m3-surface-container-high'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-xs uppercase tracking-tight transition-colors ${
                        hasChanges
                          ? isSelected
                            ? 'text-amber-300 font-black'
                            : 'text-amber-600 dark:text-amber-400 font-black'
                          : ''
                      }`}
                    >
                      {getDayOfWeekName(day.dayOfWeek || day.dayOfWeekName, undefined, true)}
                    </span>
                    {isToday && (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-white' : 'bg-m3-primary'}`} />
                    )}
                  </div>
                  {holiday.isHoliday ? (
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full flex items-center justify-center max-w-full ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'text-sky-600 dark:text-sky-400'
                      }`}
                    >
                      <span className="truncate">{holiday.shortBadgeLabel}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold opacity-85 leading-tight">
                      {day.date ? formatCzechDate(day.date, 'short') : t('permanentScheduleShort')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Day Timetable List */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black font-display text-m3-on-surface">
                  {selectedDay ? getDayOfWeekName(selectedDay.dayOfWeek || selectedDay.dayOfWeekName) : ''}
                </h2>
                <span className="text-xs font-bold text-m3-primary font-display">
                  {selectedDay && selectedDay.date ? formatCzechDate(selectedDay.date, 'full') : t('permanentSchedule')}
                </span>
              </div>

              {(() => {
                const selHoliday = selectedDay ? getHolidayInfo(selectedDay) : null;
                if (selHoliday?.isHoliday) {
                  return (
                    <button
                      onClick={() => setActiveHolidayModal({ day: selectedDay, holiday: selHoliday })}
                      className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 m3-pressable transition-colors bg-sky-500/15 text-sky-700 dark:text-sky-300 hover:bg-sky-500/25"
                    >
                      <span className="truncate max-w-[200px] sm:max-w-none">{selHoliday.badgeLabel}: {selHoliday.title}</span>
                    </button>
                  );
                }
                if (selectedDay?.dayDescription) {
                  return (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      {selectedDay.dayDescription}
                    </span>
                  );
                }
                return null;
              })()}
            </div>

            {/* Timetable Grid / Cards */}
            <div ref={dayViewGridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {selectedDay && selectedDay.atoms && selectedDay.atoms.length > 0 ? (
                selectedDay.atoms.map((lesson, lessonIndex) => {
                  const hour = allHours.find((h) => Number(h.id) === Number(lesson.hourId));
                  const isCellToday = isTodayDay(selectedDay);
                  const isCellCurrentHour = isCurrentHourActive && Number(hour?.id) === Number(currentHourId);
                  return (
                    <div
                      key={lesson.id}
                      data-day-hour-card={hour?.id || lesson.hourId}
                      className="relative w-full"
                    >
                      <LessonCard
                        lesson={lesson}
                        hour={hour}
                        variant="full"
                        radiusClass={responsiveGroupRadius(lessonIndex, selectedDay.atoms!.length, { base: 1, sm: 2, lg: 3 })}
                        isOngoing={isCellToday && isCellCurrentHour}
                        testMark={activeTab === 'permanent' || !selectedDay ? undefined : testMarkFor(selectedDay.date, hour?.id)}
                        onClick={() => openLessonModal(lesson, hour, selectedDay)}
                      />

                      {/* Straight vertical timeline indicator for active hour on day view card */}
                      {isCellToday && isCellCurrentHour && (
                        <div
                          className="absolute top-0 bottom-0 z-30 pointer-events-none -translate-x-1/2"
                          style={{
                            left: `clamp(12px, ${hourProgress * 100}%, calc(100% - 12px))`,
                          }}
                        >
                          <div className="w-[2px] h-full bg-m3-primary shadow-xs" />
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (() => {
                const selHoliday = selectedDay ? getHolidayInfo(selectedDay) : null;
                if (selHoliday?.isHoliday) {
                  return (
                    <div
                      onClick={() => setActiveHolidayModal({ day: selectedDay, holiday: selHoliday })}
                      className="col-span-full py-12 px-6 rounded-m3-3xl flex flex-col items-center justify-center text-center gap-3 cursor-pointer shadow-xs transition-all hover:scale-[1.01] select-none bg-gradient-to-br from-sky-500/15 via-m3-surface-container to-sky-500/5"
                    >
                      <div className="w-16 h-16 rounded-3xl flex items-center justify-center shadow-xs bg-sky-500/20 text-sky-600 dark:text-sky-400">
                        <CalendarDays className="w-9 h-9" />
                      </div>
                      <div className="flex flex-col gap-1 max-w-md">
                        <span className="text-xs font-black uppercase tracking-wider text-sky-600 dark:text-sky-400">
                          {selHoliday.badgeLabel}
                        </span>
                        <h3 className="text-xl sm:text-2xl font-black font-display text-m3-on-surface">
                          {selHoliday.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-m3-on-surface-variant font-medium mt-1">
                          {selHoliday.description || t('dayOffNotice')} • {t('enjoyFreeDay')}
                        </p>
                      </div>
                      <span className="mt-2 text-xs font-bold flex items-center gap-1 text-sky-600 dark:text-sky-400">
                        <span>{t('holidayDetails')}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center text-center gap-2 rounded-m3-2xl bg-m3-surface-container text-m3-on-surface-variant">
                    <CalendarIcon className="w-10 h-10 text-m3-on-surface-variant/40" />
                    <span className="text-sm font-bold font-display text-m3-on-surface">
                      {t('noLessonsToday')}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 4. Lesson Details Modal */}
      {activeLessonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in"
            onClick={closeLessonModal}
          />

          <div className="relative w-full max-w-md p-6 rounded-m3-3xl bg-m3-surface-container text-m3-on-surface shadow-2xl z-10 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-extrabold text-m3-primary font-display uppercase tracking-wider">
                  {activeLessonModal.lesson.subjectAbbrev} • {activeLessonModal.hour?.caption || activeLessonModal.lesson.hourId}. hodina
                </span>
                <h3 className="text-xl font-black font-display text-m3-on-surface mt-0.5">
                  {activeLessonModal.lesson.subjectName}
                </h3>
              </div>

              <button
                onClick={closeLessonModal}
                className="w-8 h-8 rounded-full bg-m3-surface-container-high flex items-center justify-center text-m3-on-surface-variant hover:text-m3-on-surface m3-pressable"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Change banner if substitution / cancellation / addition / room change */}
            {activeLessonModal.lesson.hasChange && activeLessonModal.lesson.change && (() => {
              const ch = activeLessonModal.lesson.change;
              const rawType = (ch.changeType || '').toLowerCase();
              const rawTypeName = (ch.typeName || '').toLowerCase();
              const rawDesc = (ch.description || '').toLowerCase();
              const summary = `${rawType} ${rawTypeName} ${rawDesc}`;

              const isCanceled =
                ch.changeType === 'Canceled' ||
                ch.changeType === 'Removed' ||
                summary.includes('cancel') ||
                summary.includes('odpad') ||
                summary.includes('vyjmut') ||
                summary.includes('removed');
              const isAdded =
                !isCanceled &&
                (ch.changeType === 'Added' ||
                  summary.includes('added') ||
                  summary.includes('přidán') ||
                  summary.includes('pridan') ||
                  summary.includes('navíc') ||
                  summary.includes('navic'));
              const isRoom =
                !isCanceled &&
                !isAdded &&
                (ch.changeType === 'RoomChanged' ||
                  summary.includes('room') ||
                  summary.includes('místnost') ||
                  summary.includes('učebn') ||
                  summary.includes('přesun'));

              const bannerBg = isCanceled
                ? 'bg-rose-500/15 text-rose-800 dark:text-rose-200'
                : isAdded
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                : isRoom
                ? 'bg-sky-500/15 text-sky-800 dark:text-sky-200'
                : 'bg-amber-500/15 text-amber-800 dark:text-amber-200';

              const Icon = isCanceled ? Ban : isAdded ? CalendarPlus : isRoom ? MapPin : AlertCircle;
              const iconColor = isCanceled
                ? 'text-rose-500'
                : isAdded
                ? 'text-emerald-500'
                : isRoom
                ? 'text-sky-500'
                : 'text-amber-500';

              const title = isAdded
                ? (ch.typeName || t('addedToTimetable'))
                : isCanceled
                ? (ch.typeName || t('canceledLessonType'))
                : isRoom
                ? (ch.typeName || t('roomChangedType'))
                : (ch.typeName || t('timetableChange'));

              return (
                <div className={`p-3 rounded-m3-xl ${bannerBg} flex items-start gap-2.5 text-xs font-semibold`}>
                  <Icon className={`w-4 h-4 ${iconColor} shrink-0 mt-0.5`} />
                  <div>
                    <span className="font-extrabold block">
                      {title}
                    </span>
                    {ch.description && <p className="mt-0.5">{ch.description}</p>}
                  </div>
                </div>
              );
            })()}

            {/* Info Items */}
            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-m3-xl bg-m3-surface-container-high flex items-center justify-between">
                <span className="text-m3-on-surface-variant flex items-center gap-1.5 font-bold">
                  <Clock className="w-4 h-4 text-m3-primary" />
                  {t('lessonTimeModal')}
                </span>
                <span className="font-extrabold text-m3-on-surface font-display">
                  {activeLessonModal.hour ? `${activeLessonModal.hour.beginTime} – ${activeLessonModal.hour.endTime}` : '-'}
                </span>
              </div>

              {(activeLessonModal.lesson.roomAbbrev || activeLessonModal.lesson.roomId) && (
                <div className="p-3 rounded-m3-xl bg-m3-surface-container-high flex items-center justify-between">
                  <span className="text-m3-on-surface-variant flex items-center gap-1.5 font-bold">
                    <MapPin className="w-4 h-4 text-m3-primary" />
                    {t('roomModal')}
                  </span>
                  <span className="font-extrabold text-m3-on-surface font-display">
                    {activeLessonModal.lesson.roomAbbrev || activeLessonModal.lesson.roomId}
                  </span>
                </div>
              )}

              {(activeLessonModal.lesson.teacherName || activeLessonModal.lesson.teacherAbbrev) && (
                <div className="p-3 rounded-m3-xl bg-m3-surface-container-high flex items-center justify-between">
                  <span className="text-m3-on-surface-variant flex items-center gap-1.5 font-bold">
                    <User className="w-4 h-4 text-m3-primary" />
                    {t('teacherModal')}
                  </span>
                  <span className="font-extrabold text-m3-on-surface font-display">
                    {activeLessonModal.lesson.teacherName || activeLessonModal.lesson.teacherAbbrev}
                    {activeLessonModal.lesson.teacherName && activeLessonModal.lesson.teacherAbbrev && activeLessonModal.lesson.teacherName !== activeLessonModal.lesson.teacherAbbrev && (
                      <span className="ml-1.5 text-xs text-m3-on-surface-variant font-normal">
                        ({activeLessonModal.lesson.teacherAbbrev})
                      </span>
                    )}
                  </span>
                </div>
              )}

              {activeLessonModal.lesson.change?.substituteTeacher && (
                <div className="p-3 rounded-m3-xl bg-amber-500/15 text-amber-800 dark:text-amber-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold">
                    <User className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    {t('substituteTeacherModal')}
                  </span>
                  <span className="font-extrabold text-amber-900 dark:text-amber-100 font-display">
                    {activeLessonModal.lesson.change.substituteTeacher}
                  </span>
                </div>
              )}

              {(() => {
                const modalGroup = cleanLessonGroup(activeLessonModal.lesson.group, user?.className);
                if (!modalGroup) return null;
                return (
                  <div className="p-3 rounded-m3-xl bg-m3-surface-container-high flex items-center justify-between">
                    <span className="text-m3-on-surface-variant flex items-center gap-1.5 font-bold">
                      <Layers className="w-4 h-4 text-m3-primary" />
                      {t('groupOrClass')}
                    </span>
                    <span className="font-extrabold text-m3-on-surface font-display">
                      {modalGroup}
                    </span>
                  </div>
                );
              })()}

              {activeTab === 'permanent' && activeLessonModal.lesson.cycle && activeLessonModal.lesson.cycle !== 'both' && (
                <div className="p-3 rounded-m3-xl bg-m3-surface-container-high flex items-center justify-between">
                  <span className="text-m3-on-surface-variant flex items-center gap-1.5 font-bold">
                    <CalendarDays className="w-4 h-4 text-m3-primary" />
                    {t('cycleModal')}
                  </span>
                  <span className={`font-extrabold px-2.5 py-0.5 rounded-full text-xs font-display ${
                    activeLessonModal.lesson.cycle === 'odd'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  }`}>
                    {activeLessonModal.lesson.cycle === 'odd' ? t('oddWeek') : t('evenWeek')}
                  </span>
                </div>
              )}
            </div>

            {/* Test mark (user-flagged "test being written") – only for real dated hours */}
            {activeTab === 'current' && activeLessonModal.day?.date && activeLessonModal.hour && !activeLessonModal.lesson.change?.typeAbbrev && (
              <div className="p-3 rounded-m3-2xl bg-pink-500/10 flex flex-col gap-2.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <PencilLine className="w-4 h-4 text-pink-500 shrink-0" />
                  <span className="text-xs font-extrabold uppercase tracking-wider font-display text-m3-on-surface truncate">
                    {t('testMarkTitle')}
                  </span>
                </div>

                {/* Same height with and without a mark: the button turns into the field with Cancel beside it. */}
                {modalTestMark ? (
                  <div className="flex items-center gap-2 h-9">
                    <input
                      type="text"
                      value={testDraft}
                      onChange={(e) => setTestDraft(e.target.value)}
                      placeholder={t('testDescriptionPlaceholder')}
                      maxLength={120}
                      className="min-w-0 flex-1 h-full px-3 rounded-m3-xl bg-m3-surface-container-high text-m3-on-surface text-xs font-medium focus:outline-none focus:ring-2 focus:ring-pink-500/40"
                    />
                    <button
                      onClick={() => {
                        pendingTestSave.current = null;
                        removeTestMark(modalTestMark.id);
                      }}
                      className="h-full px-4 rounded-full bg-m3-surface-container-high text-m3-on-surface-variant text-xs font-bold m3-pressable shrink-0"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => addTestMark({
                      date: activeLessonModal.day!.date!,
                      hourId: activeLessonModal.hour!.id,
                      description: '',
                    })}
                    className="w-full h-9 rounded-full bg-pink-500 hover:bg-pink-600 text-white text-xs font-extrabold font-display m3-pressable transition-all flex items-center justify-center gap-1.5"
                  >
                    <PencilLine className="w-3.5 h-3.5" />
                    {t('testMarkAdd')}
                  </button>
                )}
              </div>
            )}

            {/* Close button */}
            <button
              onClick={closeLessonModal}
              className="w-full py-2.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-bold font-display text-xs m3-pressable"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {/* 5. Holiday Details Modal */}
      {activeHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in"
            onClick={() => setActiveHolidayModal(null)}
          />

          <div className="relative w-full max-w-md p-6 rounded-m3-3xl bg-m3-surface-container text-m3-on-surface shadow-2xl z-10 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-black font-display uppercase tracking-wider text-sky-600 dark:text-sky-400">
                  {activeHolidayModal.holiday.badgeLabel}
                </span>
                <h3 className="text-xl font-black font-display text-m3-on-surface mt-0.5">
                  {activeHolidayModal.holiday.title}
                </h3>
              </div>

              <button
                onClick={() => setActiveHolidayModal(null)}
                className="w-8 h-8 rounded-full bg-m3-surface-container-high flex items-center justify-center text-m3-on-surface-variant hover:text-m3-on-surface m3-pressable"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Details */}
            <div className="flex flex-col gap-3 py-1">
              <div className="flex items-center gap-3 p-3 rounded-m3-xl bg-m3-surface-container-high/60 text-sm">
                <CalendarDays className="w-5 h-5 text-m3-primary shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-m3-on-surface-variant">{t('events')} / Datum</span>
                  <span className="font-extrabold text-m3-on-surface text-sm">
                    {getDayOfWeekName(activeHolidayModal.day.dayOfWeek || activeHolidayModal.day.dayOfWeekName)}, {formatCzechDate(activeHolidayModal.day.date, 'full')}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-m3-xl text-xs flex flex-col gap-1.5 bg-sky-500/10 text-m3-on-surface">
                <div className="font-bold text-sky-700 dark:text-sky-300">
                  <span>
                    {activeHolidayModal.holiday.isPublicHoliday
                      ? 'Státní svátek České republiky'
                      : activeHolidayModal.holiday.badgeLabel}
                  </span>
                </div>
                <p className="text-m3-on-surface-variant leading-relaxed">
                  {activeHolidayModal.holiday.description || t('dayOffNotice')}
                </p>
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setActiveHolidayModal(null)}
              className="w-full py-2.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-bold font-display text-xs m3-pressable transition-colors"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
