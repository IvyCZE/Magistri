import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarDays, Clock, Layers, MapPin, PencilLine, User, X } from 'lucide-react';
import { getLessonChangeDetails, type LessonDay } from '../../domain/lessonChanges';
import { lessonChangeStyles } from './lessonChangeStyles';
import { useDataStore } from '../../stores/dataStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { Lesson, TestMark, TimetableHour } from '../../types/bakalari';
import { cleanLessonGroup } from '../../utils/textUtils';
import { MaterialMorphingLoader } from './MaterialMorphingLoader';
import { TimetableDetailsSheet } from './TimetableDetailsSheet';

type TestSlot = Pick<TestMark, 'date' | 'hourId'>;

function LessonTestMark({ slot, mark }: { slot: TestSlot; mark?: TestMark }) {
  const { t } = useSettingsStore();
  const { addTestMark, updateTestMark, removeTestMark } = useDataStore();
  const [draft, setDraft] = useState<{ id: string; description: string }>();
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<typeof draft>(undefined);

  const saveDescription = useCallback(() => {
    window.clearTimeout(timer.current);
    const edit = pending.current;
    pending.current = undefined;
    if (edit) updateTestMark(edit.id, { description: edit.description.trim() });
  }, [updateTestMark]);

  useEffect(() => saveDescription, [saveDescription]);

  return (
    <div data-sheet-swipe-disabled className="relative flex h-11 justify-end">
      {mark && (
        <input
          type="text"
          aria-label={t('editTest')}
          value={draft?.id === mark.id ? draft.description : mark.description || ''}
          onChange={(event) => {
            const edit = { id: mark.id, description: event.target.value };
            setDraft(edit);
            pending.current = edit;
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(saveDescription, 500);
          }}
          onBlur={saveDescription}
          placeholder={t('testDescriptionPlaceholder')}
          maxLength={120}
          className="absolute inset-y-0 left-0 w-[calc(100%-3.25rem)] min-w-0 rounded-full bg-m3-surface-container-high px-4 text-base font-medium text-m3-on-surface placeholder:text-m3-on-surface-variant focus:outline-none focus:bg-m3-surface-container-highest sm:text-sm animate-in fade-in duration-[250ms] motion-reduce:animate-none"
        />
      )}
      <button
        type="button"
        aria-label={mark ? t('removeTest') : undefined}
        onClick={() => {
          if (mark) {
            window.clearTimeout(timer.current);
            pending.current = undefined;
            setDraft(undefined);
            removeTestMark(mark.id);
          } else {
            addTestMark({ ...slot, description: '' });
          }
        }}
        className={`relative grid h-full place-items-center overflow-hidden rounded-full bg-m3-primary text-m3-on-primary font-bold font-display text-sm transition-[width,transform] duration-[250ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] motion-reduce:transition-none ${mark ? 'w-11' : 'w-full'}`}
      >
        {mark ? <X aria-hidden="true" className="size-5" /> : (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <PencilLine aria-hidden="true" className="size-4" />
            {t('testMarkAdd')}
          </span>
        )}
      </button>
    </div>
  );
}

interface LessonDetailsSheetProps {
  lesson: Lesson;
  day?: LessonDay;
  hour?: TimetableHour;
  permanent: boolean;
  className?: string;
  topic?: string;
  isTopicLoading: boolean;
  testSlot?: TestSlot;
  testMark?: TestMark;
  onClose: () => void;
}

export function LessonDetailsSheet({
  lesson, day, hour, permanent, className, topic, isTopicLoading, testSlot, testMark, onClose,
}: LessonDetailsSheetProps) {
  const { t } = useSettingsStore();
  const permanentDays = useDataStore((state) => state.permanentTimetable.days);
  const { kind, room, roomChanged, teacherChanged, subjectChanged } = getLessonChangeDetails(lesson, day, permanentDays);
  const changeStyle = kind ? lessonChangeStyles[kind] : undefined;
  const ChangeIcon = changeStyle?.Icon;
  const subjectColor = changeStyle && (subjectChanged || kind === 'canceled')
    ? `${changeStyle.color} ${kind === 'canceled' ? 'line-through' : ''}`
    : '';
  const substituteName = teacherChanged ? lesson.change?.substituteTeacher?.trim() : undefined;
  const separateSubstitute = substituteName && lesson.teacherName !== substituteName && lesson.teacherName;
  const teacherColor = teacherChanged ? changeStyle?.color || '' : '';
  const roomColor = roomChanged ? changeStyle?.color || '' : '';
  const changeLabel = lesson.change?.typeName || (
    kind === 'canceled' ? t('canceledLessonType')
      : kind === 'added' ? t('addedToTimetable')
      : kind === 'room' ? t('roomChangedType')
      : t('timetableChange')
  );

  return (
    <TimetableDetailsSheet
      label={<><span className={subjectColor}>{lesson.subjectAbbrev}</span> • {t('lessonHourFormat', { count: hour?.caption || lesson.hourId })}</>}
      title={<span className={subjectColor}>{lesson.subjectName || lesson.subjectAbbrev}</span>}
      onClose={onClose}
    >
      {ChangeIcon && (
        <div className="flex items-center gap-2 px-3 py-1 text-xs text-m3-on-surface-variant">
          <ChangeIcon aria-hidden="true" className={`size-4 shrink-0 ${changeStyle.color}`} />
          <div>
            <p className="font-bold text-m3-on-surface">{changeLabel}</p>
            {lesson.change?.description && <p className="mt-0.5">{lesson.change.description}</p>}
          </div>
        </div>
      )}

      {/* Info Items */}
      <div className="space-y-2.5 text-xs">
        <div className="p-3 rounded-m3-xl bg-m3-surface-container-high flex items-center justify-between">
          <span className="text-m3-on-surface-variant flex items-center gap-1.5 font-bold">
            <Clock className="w-4 h-4 text-m3-primary" />
            {t('lessonTimeModal')}
          </span>
          <span className="font-extrabold text-m3-on-surface font-display">
            {hour ? `${hour.beginTime} – ${hour.endTime}` : '-'}
          </span>
        </div>

        {room && (
          <div className="p-3 rounded-m3-xl bg-m3-surface-container-high flex items-center justify-between">
            <span className="text-m3-on-surface-variant flex items-center gap-1.5 font-bold">
              <MapPin className="w-4 h-4 text-m3-primary" />
              {t('roomModal')}
            </span>
            <span className={`font-extrabold font-display ${roomColor || 'text-m3-on-surface'}`}>{room}</span>
          </div>
        )}

        {(lesson.teacherName || lesson.teacherAbbrev || substituteName) && (
          <div className="p-3 rounded-m3-xl bg-m3-surface-container-high flex items-center justify-between gap-2">
            <span className="text-m3-on-surface-variant flex items-center gap-1.5 font-bold">
              <User className="w-4 h-4 shrink-0 text-m3-primary" />
              {teacherChanged && !separateSubstitute ? t('substituteTeacherModal') : t('teacherModal')}
            </span>
            <span className={`font-extrabold font-display min-w-0 break-words text-right ${(!separateSubstitute && teacherColor) || 'text-m3-on-surface'}`}>
              {(separateSubstitute ? undefined : substituteName) || lesson.teacherName || lesson.teacherAbbrev}
              {(!substituteName || separateSubstitute) && lesson.teacherName && lesson.teacherAbbrev && lesson.teacherName !== lesson.teacherAbbrev && (
                <span className={`ml-1.5 text-xs font-normal ${!separateSubstitute && teacherColor ? '' : 'text-m3-on-surface-variant'}`}>
                  ({lesson.teacherAbbrev})
                </span>
              )}
            </span>
          </div>
        )}

        {separateSubstitute && (
          <div className="p-3 rounded-m3-xl bg-m3-surface-container-high flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-bold text-m3-on-surface-variant">
              <User className="w-4 h-4 shrink-0 text-m3-primary" />
              {t('substituteTeacherModal')}
            </span>
            <span className={`font-extrabold font-display min-w-0 break-words text-right ${teacherColor}`}>
              {substituteName}
            </span>
          </div>
        )}

        {(() => {
          const modalGroup = cleanLessonGroup(lesson.group, className);
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

        {permanent && lesson.cycle && lesson.cycle !== 'both' && (
          <div className="p-3 rounded-m3-xl bg-m3-surface-container-high flex items-center justify-between">
            <span className="text-m3-on-surface-variant flex items-center gap-1.5 font-bold">
              <CalendarDays className="w-4 h-4 text-m3-primary" />
              {t('cycleModal')}
            </span>
            <span className={`font-extrabold px-2.5 py-0.5 rounded-full text-xs font-display ${
              lesson.cycle === 'odd'
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
            }`}>
              {lesson.cycle === 'odd' ? t('oddWeek') : t('evenWeek')}
            </span>
          </div>
        )}
      </div>
      {topic && (
        <section className="rounded-m3-xl bg-m3-surface-container-high px-3 pb-3 pt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-m3-on-surface-variant">
            <BookOpen aria-hidden="true" className="size-4 text-m3-primary" />
            {t('lessonTopic')}
          </h3>
          <p className="mt-1.5 pl-[2px] break-words whitespace-pre-wrap text-sm font-medium leading-relaxed">{topic}</p>
        </section>
      )}
      {!topic && isTopicLoading && (
        <p role="status" className="flex items-center gap-2 px-3 py-1 text-xs text-m3-on-surface-variant">
          <MaterialMorphingLoader size={16} className="shrink-0 text-m3-primary" />
          {t('loadingLessonTopic')}
        </p>
      )}
      {testSlot && <LessonTestMark slot={testSlot} mark={testMark} />}
    </TimetableDetailsSheet>
  );
}
