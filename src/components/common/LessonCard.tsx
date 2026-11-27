import React from 'react';
import { Lesson, TestMark, TimetableHour } from '../../types/bakalari';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getLessonChangeDetails, type LessonDay } from '../../domain/lessonChanges';
import { lessonChangeStyles } from './lessonChangeStyles';
import { cleanLessonGroup } from '../../utils/textUtils';
import { GraduationCap, MapPin, PencilLine, User } from 'lucide-react';

export type LessonCardVariant = 'full' | 'compact' | 'matrix' | 'widget';

interface LessonCardProps {
  lesson?: Lesson;
  day?: LessonDay;
  hour?: TimetableHour;
  variant?: LessonCardVariant;
  compact?: boolean; // backwards compatibility
  isOngoing?: boolean;
  /** Corner classes for the full variant, so a list can join its cards. */
  radiusClass?: string;
  testMark?: TestMark | null; // user-flagged "test being written" for this hour
  onClick?: () => void;
}

export function getTeacherSurname(teacherName?: string, teacherAbbrev?: string): string {
  if (!teacherName || !teacherName.trim()) {
    return teacherAbbrev || '';
  }

  let name = teacherName.trim();
  // Strip degree suffixes: ", BA", ", Ph.D.", etc.
  name = name.replace(/,\s*(?:BA|MA|Ph\.D\.|PhD|MBA|DiS\.|CSc\.|DrSc\.)/gi, '').trim();

  // Strip degree prefixes: "Mgr. ", "PhDr. ", "Ing. ", "RNDr. ", etc.
  name = name.replace(/^(?:Mgr\.|Mgr|PhDr\.|PhDr|Ing\.|Ing|RNDr\.|RNDr|Bc\.|Bc|BcA\.|doc\.|prof\.|PaedDr\.|MUDr\.|JUDr\.|ThDr\.|PharmDr\.|MVDr\.)\s+/gi, '').trim();

  // If format is "Surname, Firstname"
  if (name.includes(',')) {
    return name.split(',')[0].trim();
  }

  // If format is "Firstname Surname"
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return parts[parts.length - 1];
  }

  return name || teacherAbbrev || '';
}

/**
 * Returns teacher code (abbreviation, e.g. "Mc", "Dvo", "Hor").
 * If the code is missing or empty, falls back to teacher surname or full name.
 */
export function getTeacherDisplayCode(teacherAbbrev?: string, teacherName?: string): string {
  if (teacherAbbrev && teacherAbbrev.trim()) {
    return teacherAbbrev.trim();
  }
  return getTeacherSurname(teacherName, teacherAbbrev);
}

/** Resolves a substitute's code from the teacher directory, with a name fallback. */
function getSubstituteTeacherCode(
  substituteTeacherName: string,
  teachersList: Array<{ name: string; abbrev?: string }>,
): string {
  const surname = substituteTeacherName
    .replace(/,\s*(?:BA|MA|Ph\.D\.|PhD|MBA|DiS\.|CSc\.|DrSc\.)/gi, '')
    .replace(/^(?:Mgr\.|Mgr|PhDr\.|PhDr|Ing\.|Ing|RNDr\.|RNDr|Bc\.|Bc|BcA\.|doc\.|prof\.|PaedDr\.|MUDr\.|JUDr\.|ThDr\.|PharmDr\.|MVDr\.)\s+/i, '')
    .trim()
    .split(/\s+/)[0];

  const normalized = surname.toLowerCase();
  const matches = teachersList.filter((teacher) => teacher.abbrev &&
    teacher.name.toLowerCase().split(/[^\p{L}]+/u).includes(normalized));
  if (matches.length === 1) return matches[0].abbrev!;

  return surname || substituteTeacherName;
}

/**
 * Automatically measures the rendered text width against the container's available pixel width.
 * If the rendered text exceeds the container width (e.g. wide glyphs like "CHE" or longer words),
 * it dynamically scales down with hardware-accelerated CSS transform so it NEVER truncates or clips.
 */
interface AutoFitSubjectTextProps {
  text: string;
  className?: string;
}

export const AutoFitSubjectText: React.FC<AutoFitSubjectTextProps> = ({ text, className = 'text-m3-on-surface' }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const textRef = React.useRef<HTMLSpanElement>(null);
  const [scale, setScale] = React.useState(1);

  const updateScale = React.useCallback(() => {
    if (!containerRef.current || !textRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const textWidth = textRef.current.scrollWidth;

    if (containerWidth > 0 && textWidth > 0) {
      if (textWidth > containerWidth) {
        // Scale down to fit inside the container with a tiny buffer
        const newScale = Math.max(0.4, (containerWidth / textWidth) * 0.96);
        setScale(newScale);
      } else {
        setScale(1);
      }
    }
  }, []);

  React.useLayoutEffect(() => {
    updateScale();
  }, [text, className, updateScale]);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      updateScale();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateScale]);

  return (
    <div
      ref={containerRef}
      className="w-full max-w-full min-w-0 flex items-center justify-center overflow-hidden"
    >
      <span
        ref={textRef}
        title={text}
        style={{
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'center center',
          display: 'inline-block',
        }}
        className={`text-base sm:text-lg font-black font-display tracking-tight leading-none text-center whitespace-nowrap shrink-0 transition-transform duration-75 ${
          className
        }`}
      >
        {text}
      </span>
    </div>
  );
};

export const LessonCard: React.FC<LessonCardProps> = ({
  lesson,
  day,
  hour,
  variant,
  compact = false,
  radiusClass = 'rounded-m3-2xl',
  testMark,
  onClick,
}) => {
  const teachers = useDataStore((state) => state.teachers);
  const permanentDays = useDataStore((state) => state.permanentTimetable.days);
  const userClassName = useAuthStore((state) => state.user?.className);
  const t = useSettingsStore((state) => state.t);

  // Resolve active variant
  const activeVariant: LessonCardVariant = variant || (compact ? 'compact' : 'full');

  if (!lesson) {
    if (activeVariant === 'matrix') {
      return (
        <div className="w-full h-full min-w-0 min-h-[72px] sm:min-h-[78px] rounded-m3-xl bg-m3-surface-container-low/50 flex items-center justify-center select-none shadow-xs">
          <div className="w-1.5 h-1.5 rounded-full bg-m3-on-surface-variant/25" />
        </div>
      );
    }
    if (activeVariant === 'widget') {
      return (
        <div className="w-[92px] sm:w-[104px] h-[72px] sm:h-[78px] rounded-m3-xl bg-m3-surface-container-low/50 flex items-center justify-center select-none shrink-0 shadow-xs">
          <div className="w-1.5 h-1.5 rounded-full bg-m3-on-surface-variant/25" />
        </div>
      );
    }
    if (activeVariant === 'compact') {
      return (
        <div className="w-[105px] sm:w-[118px] h-[74px] sm:h-[80px] rounded-m3-xl bg-m3-surface-container-low/50 flex items-center justify-center select-none shrink-0 shadow-xs">
          <div className="w-1.5 h-1.5 rounded-full bg-m3-on-surface-variant/25" />
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center rounded-m3-xl h-[105px] p-3 text-m3-on-surface-variant/40 bg-m3-surface-container-low/50 shadow-xs">
        <span className="text-xs font-bold">{hour?.caption}. hod</span>
        <span className="text-[10px] text-m3-on-surface-variant/40 mt-0.5">{hour?.beginTime}</span>
        <div className="w-1.5 h-1.5 rounded-full bg-m3-on-surface-variant/25 mt-1" />
      </div>
    );
  }

  const lessonAction = onClick && {
    role: 'button',
    tabIndex: 0,
    'aria-label': `${lesson.subjectName || lesson.subjectAbbrev}, ${t('lessonHourFormat', { count: hour?.caption || lesson.hourId })}`,
    onClick,
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (!event.repeat) onClick();
    },
  };

  const { kind, room, roomChanged, teacherChanged, subjectChanged } =
    getLessonChangeDetails(lesson, day, permanentDays);
  const changeStyle = kind ? lessonChangeStyles[kind] : undefined;
  const changeColor = changeStyle?.color || '';
  const subjectColor = subjectChanged || kind === 'canceled' ? changeColor : '';
  const subjectDecoration = kind === 'canceled' ? 'line-through' : '';
  const ChangeIcon = changeStyle?.Icon;
  const hasTest = Boolean(testMark);
  const containerBg = changeStyle ? `${changeStyle.background} text-m3-on-surface`
    : hasTest ? 'bg-pink-500/15 text-pink-700 dark:text-pink-300'
      : 'bg-[color-mix(in_srgb,var(--m3-surface-container-high)_95%,var(--m3-on-surface))] hover:bg-[color-mix(in_srgb,var(--m3-surface-container-highest)_95%,var(--m3-on-surface))] dark:bg-m3-surface-container-high dark:hover:bg-m3-surface-container-highest text-m3-on-surface';

  const displayGroup = cleanLessonGroup(lesson.group, userClassName);
  const substituteName = teacherChanged ? lesson.change?.substituteTeacher?.trim() : undefined;
  const teacherName = substituteName || lesson.teacherName;
  const teacherCode = substituteName && substituteName !== lesson.teacherName
    ? getSubstituteTeacherCode(substituteName, teachers)
    : getTeacherDisplayCode(lesson.teacherAbbrev, teacherName);
  const teacherTitle = teacherName && teacherName !== teacherCode ? `${teacherName} (${teacherCode})` : teacherCode;
  const teacherColor = teacherChanged ? changeColor : '';
  const roomColor = roomChanged && room ? changeColor : '';

  // 1, 2, 3: Timetable Cell Variants (Matrix, Widget, Compact Horizontal)
  // Clean 3-Row Layout:
  // Row 1: Room number + group (if there is one)
  // Row 2: Shortened subject name + change symbol (if there is a change)
  // Row 3: Full teacher's surname
  if (activeVariant === 'matrix' || activeVariant === 'widget' || activeVariant === 'compact') {
    let sizeClasses = 'w-full h-full min-w-0 min-h-[72px] sm:min-h-[78px] p-2 sm:p-2.5';
    if (activeVariant === 'widget') {
      sizeClasses = 'w-[92px] sm:w-[104px] h-[72px] sm:h-[78px] p-2 sm:p-2.5 shrink-0';
    } else if (activeVariant === 'compact') {
      sizeClasses = 'w-[105px] sm:w-[118px] h-[74px] sm:h-[80px] p-2 sm:p-2.5 shrink-0';
    }

    // Course/event cell (e.g. "kurz"): centered label, no room/teacher rows.
    if (kind === 'course') {
      return (
        <div
          {...lessonAction}
          className={`${sizeClasses} rounded-m3-xl flex flex-col items-center justify-center gap-1.5 m3-pressable cursor-pointer select-none shadow-xs min-w-0 overflow-hidden transition-all ${containerBg}`}
        >
          <GraduationCap className={`w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 ${changeColor}`} />
          <AutoFitSubjectText text={lesson.subjectAbbrev || lesson.subjectName} className={subjectColor} />
        </div>
      );
    }

    return (
      <div
        {...lessonAction}
        className={`${sizeClasses} rounded-m3-xl flex flex-col justify-between transition-all m3-pressable cursor-pointer select-none shadow-xs min-w-0 overflow-hidden ${containerBg}`}
      >
        {/* Row 1: Room number (and group if not in tight vertical matrix) */}
        <div className="h-4 sm:h-4.5 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] leading-none min-w-0 w-full overflow-hidden shrink-0">
          <span
            title={room || '-'}
            className={`font-bold px-1.5 py-0.5 rounded-md leading-none truncate shrink min-w-0 bg-m3-surface-container-highest/90 ${roomColor || 'text-m3-on-surface'}`}
          >
            {room || '-'}
          </span>
          {activeVariant !== 'matrix' && displayGroup && (
            <span
              title={displayGroup}
              className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-m3-surface-container-highest/80 text-m3-on-surface-variant uppercase truncate max-w-[50%] shrink min-w-0 leading-none"
            >
              {displayGroup}
            </span>
          )}
        </div>

        {/* Row 2: Centered dynamically-scaled shortened subject name + change symbol (never truncated) */}
        <div className="flex-1 flex items-center justify-center gap-1 min-w-0 w-full overflow-hidden text-center py-0.5 px-0.5">
          <AutoFitSubjectText
            text={lesson.subjectAbbrev || lesson.subjectName}
            className={`${subjectColor || 'text-m3-on-surface'} ${subjectDecoration}`}
          />

          {hasTest && kind !== 'canceled' ? (
            <PencilLine className="size-3.5 text-pink-500 shrink-0" />
          ) : ChangeIcon && (
            <ChangeIcon className={`size-3.5 shrink-0 ${changeColor}`} />
          )}
        </div>

        {/* Teacher code */}
        <div className="h-4 sm:h-4.5 flex items-center text-[10px] sm:text-[11px] leading-none text-m3-on-surface-variant min-w-0 w-full overflow-hidden shrink-0">
          <span title={teacherTitle} className={`truncate min-w-0 font-bold pl-1.5 ${teacherColor || 'opacity-85'}`}>
            {teacherCode}
          </span>
        </div>
      </div>
    );
  }

  // 4. Full Detailed Card (Used in Detailed Day List View)
  return (
    <div
      {...lessonAction}
      className={`relative flex flex-col justify-between p-3 sm:p-3.5 min-h-[82px] sm:min-h-[86px] ${radiusClass} transition-all m3-pressable cursor-pointer shadow-xs ${containerBg}`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-m3-surface-container-highest text-m3-on-surface font-display shrink-0">
            {t('lessonHourFormat', { count: hour?.caption || lesson.hourId })}
          </span>
          {hour && (
            <span className="text-[11px] font-medium text-m3-on-surface-variant truncate">
              {hour.beginTime} - {hour.endTime}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {displayGroup && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-m3-surface-container-high text-m3-on-surface-variant">
              {displayGroup}
            </span>
          )}
          {teacherCode && (
            <span title={teacherTitle} className="text-[11px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 bg-m3-surface-container-highest text-m3-on-surface">
              <User className="size-3 shrink-0 text-m3-primary" />
              <span className={teacherColor}>{teacherCode}</span>
            </span>
          )}
          {room && (
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 bg-m3-surface-container-highest text-m3-on-surface">
              <MapPin className="size-3" />
              <span className={roomColor}>{room}</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="mt-1.5 mb-0.5">
        <div className="flex items-center justify-between">
          <h4 className={`text-lg font-black font-display tracking-tight leading-snug ${subjectColor || 'text-m3-on-surface'} ${subjectDecoration}`}>
            {lesson.subjectName || lesson.subjectAbbrev}
          </h4>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasTest && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-pink-500 text-white flex items-center gap-1">
                <PencilLine className="w-3 h-3" />
                Test
              </span>
            )}
            {lesson.subjectAbbrev && (
              <span className={`text-xs font-bold font-display ${subjectColor || 'text-m3-primary'} ${subjectDecoration}`}>
                {lesson.subjectAbbrev}
              </span>
            )}
          </div>
        </div>

        {hasTest && testMark?.description ? (
          <p className="text-xs font-bold text-pink-600 dark:text-pink-300 line-clamp-1 mt-0.5">
            {testMark.description}
          </p>
        ) : null}

        {lesson.theme && (
          <p className="text-xs text-m3-on-surface-variant line-clamp-1 mt-0.5 italic">
            {lesson.theme}
          </p>
        )}
      </div>

      {ChangeIcon && (lesson.change?.description || lesson.change?.typeName || kind === 'added') && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] font-medium text-m3-on-surface-variant">
          <ChangeIcon className={`size-3.5 shrink-0 mt-0.5 ${changeColor}`} />
          <span className="line-clamp-2">{lesson.change?.description || lesson.change?.typeName || t('addedToTimetable')}</span>
        </div>
      )}
    </div>
  );
};
