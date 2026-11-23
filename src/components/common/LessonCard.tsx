import React from 'react';
import { Lesson, TestMark, TimetableHour } from '../../types/bakalari';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { cleanLessonGroup } from '../../utils/textUtils';
import { AlertCircle, ArrowRightLeft, Ban, CalendarPlus, GraduationCap, MapPin, PencilLine, User } from 'lucide-react';

export type LessonCardVariant = 'full' | 'compact' | 'matrix' | 'widget';

/**
 * Builds a wavy two-color split background for a card that has both a
 * test mark (pink, bottom-right half) and a lesson change (top-left
 * half: room change = sky, substitution = amber, added = emerald).
 * The divider runs from the bottom-left corner to the top-right corner
 * like the old 135° diagonal, but it is drawn as a sine wave instead
 * of a straight line. Built as a stretched inline SVG so it stays crisp
 * at any card size; both halves keep the same translucent tints as the single-state cards.
 */
const makeWavySplitBg = (topLeftFill: string) => {
  const N = 48; // samples along the diagonal
  const K = 1; // exactly one up+down cycle: 0 → 1 → 0 → -1 → 0
  const AMP = 9; // amplitude (viewBox units, offset added to x and y equally)
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const d = AMP * Math.sin(2 * Math.PI * K * t);
    pts.push([100 * t + d, 100 - 100 * t + d]);
  }
  const fwd = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ');
  const rev = [...pts]
    .reverse()
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' L ');
  // Change tint on the top-left half, test tint on the bottom-right half
  const topLeft = `M 0,0 L 100,0 L ${rev} Z`;
  const pink = `M 100,0 L 100,100 L 0,100 L ${fwd} Z`;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>` +
    `<path d='${topLeft}' fill='${topLeftFill}'/>` +
    `<path d='${pink}' fill='rgba(236,72,153,0.16)'/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

// Test + room change (sky) / test + substitution (amber) / test + added (emerald)
const TEST_ROOM_SPLIT_WAVE = makeWavySplitBg('rgba(14,165,233,0.15)');
const TEST_SUBSTITUTED_SPLIT_WAVE = makeWavySplitBg('rgba(245,158,11,0.15)');
const TEST_ADDED_SPLIT_WAVE = makeWavySplitBg('rgba(16,185,129,0.15)');

interface LessonCardProps {
  lesson?: Lesson;
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

/**
 * Resolves teacher code for a substitute teacher:
 * 1. Parenthesized abbreviation in change description, e.g. "(Kt, 119A)" or "(Mc)"
 * 2. Lookup in teachers list by surname
 * 3. Fallback to cleaned surname
 */
export function getSubstituteTeacherCode(
  substituteTeacherName?: string,
  changeDescription?: string,
  teachersList?: Array<{ name: string; abbrev?: string }>
): string | undefined {
  if (!substituteTeacherName && !changeDescription) return undefined;

  // 1. Parenthesized abbreviation in description
  if (changeDescription) {
    const match = changeDescription.match(/\(([A-ZÁ-Ža-zá-ž0-9]{2,5})(?:,[^)]*)?\)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  if (!substituteTeacherName) return undefined;

  // 2. Clean surname
  const surname = substituteTeacherName
    .replace(/,\s*(?:BA|MA|Ph\.D\.|PhD|MBA|DiS\.|CSc\.|DrSc\.)/gi, '')
    .replace(/^(?:Mgr\.|Mgr|PhDr\.|PhDr|Ing\.|Ing|RNDr\.|RNDr|Bc\.|Bc|BcA\.|doc\.|prof\.|PaedDr\.|MUDr\.|JUDr\.|ThDr\.|PharmDr\.|MVDr\.)\s+/i, '')
    .trim()
    .split(/\s+/)[0];

  // 3. Match from known teachers list
  if (teachersList && surname) {
    const sLower = surname.toLowerCase();
    const matched = teachersList.find((t) => {
      if (!t.abbrev) return false;
      const tSurname = getTeacherSurname(t.name).toLowerCase();
      return tSurname === sLower || t.name.toLowerCase().includes(sLower);
    });
    if (matched?.abbrev) {
      return matched.abbrev;
    }
  }

  return surname || substituteTeacherName;
}

/**
 * Automatically measures the rendered text width against the container's available pixel width.
 * If the rendered text exceeds the container width (e.g. wide glyphs like "CHE" or longer words),
 * it dynamically scales down with hardware-accelerated CSS transform so it NEVER truncates or clips.
 */
interface AutoFitSubjectTextProps {
  text: string;
  isCanceled?: boolean;
}

export const AutoFitSubjectText: React.FC<AutoFitSubjectTextProps> = ({ text, isCanceled }) => {
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
  }, [text, updateScale]);

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
          isCanceled ? 'line-through text-rose-500' : 'text-m3-on-surface'
        }`}
      >
        {text}
      </span>
    </div>
  );
};

export const LessonCard: React.FC<LessonCardProps> = ({
  lesson,
  hour,
  variant,
  compact = false,
  isOngoing = false,
  radiusClass = 'rounded-m3-2xl',
  testMark,
  onClick,
}) => {
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

  // Course/event atoms (e.g. language course week "kurz") have no subject id;
  // their label comes from change.typeAbbrev (TypeAbbrev in the API).
  const isCourse = Boolean(lesson.change?.typeAbbrev) && !lesson.subjectId;

  // Check change types with fallback substring checks in case API returned Czech or unnormalized strings
  const rawChangeType = (lesson.change?.changeType || '').toLowerCase();
  const rawTypeName = (lesson.change?.typeName || '').toLowerCase();
  const rawDesc = (lesson.change?.description || '').toLowerCase();
  const changeSummary = `${rawChangeType} ${rawTypeName} ${rawDesc}`;

  const isCanceled =
    lesson.hasChange &&
    !isCourse &&
    (lesson.change?.changeType === 'Canceled' ||
      lesson.change?.changeType === 'Removed' ||
      changeSummary.includes('cancel') ||
      changeSummary.includes('odpad') ||
      changeSummary.includes('vyjmut') ||
      changeSummary.includes('removed'));

  const isAdded =
    lesson.hasChange &&
    !isCourse &&
    !isCanceled &&
    (lesson.change?.changeType === 'Added' ||
      changeSummary.includes('added') ||
      changeSummary.includes('přidán') ||
      changeSummary.includes('pridan') ||
      changeSummary.includes('navíc') ||
      changeSummary.includes('navic'));

  const isRoomChanged =
    lesson.hasChange &&
    !isCourse &&
    !isCanceled &&
    !isAdded &&
    (lesson.change?.changeType === 'RoomChanged' ||
      changeSummary.includes('room') ||
      changeSummary.includes('místnost') ||
      changeSummary.includes('mistnost') ||
      changeSummary.includes('učebn') ||
      changeSummary.includes('ucebn') ||
      changeSummary.includes('přesun') ||
      changeSummary.includes('presun'));

  const isSubstituted =
    lesson.hasChange &&
    !isCourse &&
    !isCanceled &&
    !isAdded &&
    !isRoomChanged;

  const hasTest = Boolean(testMark);

  // In light themes the plain cell sits only a step away from the card behind it, so it is mixed a bit toward the text colour.
  let containerBg =
    'bg-[color-mix(in_srgb,var(--m3-surface-container-high)_95%,var(--m3-on-surface))] hover:bg-[color-mix(in_srgb,var(--m3-surface-container-highest)_95%,var(--m3-on-surface))] dark:bg-m3-surface-container-high dark:hover:bg-m3-surface-container-highest text-m3-on-surface';
  if (isCanceled) {
    containerBg = 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
  } else if (hasTest && isAdded) {
    // Test + added: wavy two-color split (emerald top-left, pink bottom-right)
    containerBg = 'text-m3-on-surface';
  } else if (hasTest && isRoomChanged) {
    // Test + room change: wavy two-color split (sky top-left, pink bottom-right);
    // the background itself comes from containerStyle / TEST_ROOM_SPLIT_WAVE
    containerBg = 'text-m3-on-surface';
  } else if (hasTest && isSubstituted) {
    // Test + substitution: wavy two-color split (amber top-left, pink bottom-right);
    // the background itself comes from containerStyle / TEST_SUBSTITUTED_SPLIT_WAVE
    containerBg = 'text-m3-on-surface';
  } else if (isAdded) {
    containerBg = 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200';
  } else if (isSubstituted) {
    containerBg = 'bg-amber-500/15 text-amber-800 dark:text-amber-200';
  } else if (hasTest) {
    containerBg = 'bg-pink-500/15 text-pink-700 dark:text-pink-300';
  } else if (isRoomChanged) {
    containerBg = 'bg-sky-500/15 text-sky-800 dark:text-sky-200';
  } else if (isCourse) {
    containerBg = 'bg-violet-500/15 text-violet-700 dark:text-violet-300 hover:bg-violet-500/25';
  }

  // The wavy test + change split is an inline SVG background image
  // (emerald/sky/amber top-left, pink bottom-right); every other state uses its
  // Tailwind background class.
  const containerStyle: React.CSSProperties | undefined = hasTest
    ? isAdded
      ? { backgroundImage: TEST_ADDED_SPLIT_WAVE, backgroundSize: '100% 100%' }
      : isRoomChanged
      ? { backgroundImage: TEST_ROOM_SPLIT_WAVE, backgroundSize: '100% 100%' }
      : isSubstituted
      ? { backgroundImage: TEST_SUBSTITUTED_SPLIT_WAVE, backgroundSize: '100% 100%' }
      : undefined
    : undefined;

  const teachers = useDataStore((s) => s.teachers);
  const userClassName = useAuthStore((s) => s.user?.className);
  const t = useSettingsStore((s) => s.t);
  const displayGroup = cleanLessonGroup(lesson.group, userClassName);
  const teacherCode = getTeacherDisplayCode(lesson.teacherAbbrev, lesson.teacherName);

  // Substituted lesson: show the substitute teacher (parsed from the change
  // description) instead of the permanent one.
  const substituteTeacherName = isSubstituted ? lesson.change?.substituteTeacher : undefined;
  const substituteCode = isSubstituted
    ? getSubstituteTeacherCode(
        substituteTeacherName,
        lesson.change?.description,
        teachers
      )
    : undefined;

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
    if (isCourse) {
      return (
        <div
          onClick={onClick}
          style={containerStyle}
          className={`${sizeClasses} rounded-m3-xl flex flex-col items-center justify-center gap-1.5 m3-pressable cursor-pointer select-none shadow-xs min-w-0 overflow-hidden transition-all ${containerBg}`}
        >
          <GraduationCap className="w-4 h-4 sm:w-[18px] sm:h-[18px] opacity-75 shrink-0" />
          <AutoFitSubjectText text={lesson.subjectAbbrev || lesson.subjectName} />
        </div>
      );
    }

    return (
      <div
        onClick={onClick}
        style={containerStyle}
        className={`${sizeClasses} rounded-m3-xl flex flex-col justify-between transition-all m3-pressable cursor-pointer select-none shadow-xs min-w-0 overflow-hidden ${containerBg}`}
      >
        {/* Row 1: Room number (and group if not in tight vertical matrix) */}
        <div className="h-4 sm:h-4.5 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] leading-none min-w-0 w-full overflow-hidden shrink-0">
          <span
            title={lesson.roomAbbrev || lesson.roomId || '-'}
            className={`font-bold px-1.5 py-0.5 rounded-md leading-none truncate shrink min-w-0 ${
              isRoomChanged
                ? 'bg-sky-500 text-white font-black'
                : isAdded
                ? 'bg-emerald-500/25 text-emerald-900 dark:text-emerald-100 font-black'
                : 'bg-m3-surface-container-highest/90 text-m3-on-surface'
            }`}
          >
            {lesson.roomAbbrev || lesson.roomId || '-'}
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
            isCanceled={isCanceled}
          />

          {isCanceled ? (
            <Ban className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          ) : hasTest ? (
            <PencilLine className="w-3.5 h-3.5 text-pink-500 shrink-0" />
          ) : isAdded ? (
            <CalendarPlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : isSubstituted ? (
            <ArrowRightLeft className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : isRoomChanged ? (
            <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          ) : null}
        </div>

        {/* Row 3: Teacher code (abbreviation) with matching left margin.
            Substituted lessons show the substitute teacher code in an amber
            pill mirroring the room-change highlight. */}
        <div className="h-4 sm:h-4.5 flex items-center justify-between text-[10px] sm:text-[11px] leading-none text-m3-on-surface-variant min-w-0 w-full overflow-hidden shrink-0">
          {substituteCode ? (
            <span
              title={substituteTeacherName ? `${substituteTeacherName} (${substituteCode})` : substituteCode}
              className="truncate shrink min-w-0 px-1.5 py-0.5 rounded-md leading-none bg-amber-500 text-white font-black"
            >
              {substituteCode}
            </span>
          ) : (
            <span
              title={lesson.teacherName ? `${lesson.teacherName} (${teacherCode})` : teacherCode}
              className={`truncate min-w-0 w-full font-bold pl-1.5 ${isAdded ? 'text-emerald-800 dark:text-emerald-200' : 'opacity-85'}`}
            >
              {teacherCode}
            </span>
          )}
        </div>
      </div>
    );
  }

  // 4. Full Detailed Card (Used in Detailed Day List View)
  return (
    <div
      onClick={onClick}
      style={containerStyle}
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
          {(substituteCode || teacherCode) && (
            <span
              title={
                substituteCode
                  ? (substituteTeacherName ? `${substituteTeacherName} (${substituteCode})` : substituteCode)
                  : (lesson.teacherName ? `${lesson.teacherName} (${teacherCode})` : teacherCode)
              }
              className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                substituteCode
                  ? 'bg-amber-500 text-white'
                  : 'bg-m3-surface-container-highest text-m3-on-surface'
              }`}
            >
              <User className={`w-3 h-3 shrink-0 ${substituteCode ? 'text-white' : 'text-m3-primary'}`} />
              {substituteCode || teacherCode}
            </span>
          )}
          {(lesson.roomAbbrev || lesson.roomId) && (
            <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 ${
              isRoomChanged
                ? 'bg-sky-500 text-white'
                : isAdded
                ? 'bg-emerald-500/25 text-emerald-900 dark:text-emerald-100'
                : 'bg-m3-surface-container-highest text-m3-on-surface'
            }`}>
              <MapPin className="w-3 h-3" />
              {lesson.roomAbbrev || lesson.roomId}
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="mt-1.5 mb-0.5">
        <div className="flex items-center justify-between">
          <h4 className={`text-lg font-black font-display tracking-tight leading-snug ${isCanceled ? 'line-through text-rose-500' : 'text-m3-on-surface'}`}>
            {lesson.subjectName || lesson.subjectAbbrev}
          </h4>
          <div className="flex items-center gap-1.5 shrink-0">
            {isAdded && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500 text-white flex items-center gap-1">
                <CalendarPlus className="w-3 h-3" />
                {t('addedToTimetable')}
              </span>
            )}
            {hasTest && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-pink-500 text-white flex items-center gap-1">
                <PencilLine className="w-3 h-3" />
                Test
              </span>
            )}
            <span className="text-xs font-bold text-m3-primary font-display">
              {lesson.subjectAbbrev}
            </span>
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

      {/* Change description banner (if any) */}
      {lesson.hasChange && lesson.change && (
        <div className={`mt-1.5 p-1.5 rounded-m3-md flex items-start gap-1.5 text-[11px] font-medium ${
          isCanceled
            ? 'bg-rose-500/20 text-rose-800 dark:text-rose-200'
            : isAdded
            ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
            : isRoomChanged
            ? 'bg-sky-500/20 text-sky-800 dark:text-sky-200'
            : 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
        }`}>
          {isCanceled ? (
            <Ban className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          ) : isAdded ? (
            <CalendarPlus className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          ) : isRoomChanged ? (
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          )}
          <span className="line-clamp-2">{lesson.change.description || lesson.change.typeName || (isAdded ? t('addedToTimetable') : '')}</span>
        </div>
      )}
    </div>
  );
};
