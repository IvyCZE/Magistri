import type { Lesson, TimetableDay } from '../types/bakalari';
import { getWeekCycleParity } from '../utils/dateUtils';

export type LessonChangeKind = 'canceled' | 'added' | 'room' | 'substitution' | 'subject' | 'course';
export type LessonDay = Pick<TimetableDay, 'dayOfWeek' | 'date'>;

function permanentLesson(lesson: Lesson, day: LessonDay | undefined, days: readonly TimetableDay[]) {
  if (!day?.date) return undefined;
  const parity = getWeekCycleParity(new Date(`${day.date}T12:00:00`));
  const candidates = days.find((entry) => entry.dayOfWeek === day.dayOfWeek)?.atoms.filter((entry) =>
    Number(entry.hourId) === Number(lesson.hourId) &&
    (entry.group || '') === (lesson.group || '') &&
    (!entry.cycle || entry.cycle === 'both' || entry.cycle === parity),
  );
  return candidates?.length === 1 ? candidates[0] : undefined;
}

function canonicalRoom(value: string) {
  return value.toLowerCase().replace(/[\s-]/g, '');
}

export function getLessonChangeDetails(lesson: Lesson, day?: LessonDay, permanentDays: readonly TimetableDay[] = []) {
  const scheduledRoom = lesson.roomAbbrev || lesson.roomId || '';
  const change = lesson.hasChange ? lesson.change : undefined;
  if (!change) {
    return { kind: undefined, room: scheduledRoom, roomChanged: false, teacherChanged: false, subjectChanged: false };
  }

  const summary = `${change.changeType} ${change.typeName || ''} ${change.description}`;
  const canceled = /cancel|removed|odpad|vyjmut/i.test(summary);
  const added = /added|přidán|pridan|navíc|navic/i.test(summary);
  const roomChange = /roomchanged|změn[ay]\s+(?:místnost|učebn)|(?:přesun|presun)|room\s+chang/i.test(summary);
  const subjectChange = /subject\s*chang|změn[ay]\s+předmět|zmen[ay]\s+predmet/i.test(summary);
  const hasSubstitute = Boolean(change.substituteTeacher?.trim());
  // The timetable parser can classify a combined change as RoomChanged when its description names a room.
  const substitution = hasSubstitute || /substitut|supl/i.test(`${change.typeName || ''} ${change.description}`) ||
    (roomChange && change.changeType === 'Substitution');
  const kind: LessonChangeKind = canceled ? 'canceled'
    : !lesson.subjectId && change.typeAbbrev ? 'course'
    : added ? 'added'
    : substitution ? 'substitution'
    : roomChange ? 'room'
    : subjectChange ? 'subject'
    : 'substitution';

  const original = kind === 'substitution' ? permanentLesson(lesson, day, permanentDays) : undefined;
  const subjectChanged = kind === 'added' || kind === 'subject' || kind === 'course' ||
    (kind === 'substitution' && Boolean(subjectChange ||
      (original?.subjectId && lesson.subjectId && original.subjectId !== lesson.subjectId)));
  const priorTeacher = original?.teacherAbbrev || original?.teacherName;
  const currentTeacher = lesson.teacherAbbrev || lesson.teacherName;
  const teacherChanged = kind === 'substitution' && (hasSubstitute ||
    (priorTeacher && currentTeacher ? priorTeacher !== currentTeacher : !subjectChanged));

  const description = change.description || '';
  const namedRoom = description.match(/(?:změna\s+(?:učebny|místnosti)|room\s+chang(?:e|ed))\s*:\s*([^;\n(]+)/i)?.[1]?.trim()
    || description.match(/přesun\b[^;\n]*?\bdo\s+(?:(?:učebny|místnosti)\s+)?([^;\n(]+)/i)?.[1]?.trim();
  const room = (kind === 'room' || kind === 'substitution') && namedRoom &&
    canonicalRoom(namedRoom) !== canonicalRoom(scheduledRoom) ? namedRoom : scheduledRoom;
  const priorRoom = original?.roomAbbrev || original?.roomId;
  const roomChanged = kind === 'room' || (kind === 'substitution' &&
    Boolean(roomChange || (room && priorRoom && canonicalRoom(room) !== canonicalRoom(priorRoom))));

  return { kind, room, roomChanged, teacherChanged, subjectChanged };
}
