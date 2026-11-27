import type { Lesson, TeachingTopic, TimetableDay, TimetableHour } from '../types/bakalari';

const normalize = (value?: string) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

function sameSubject(topic: Pick<TeachingTopic, 'subjectId' | 'subjectAbbrev' | 'subjectName'>, lesson: Lesson) {
  const id = topic.subjectId?.trim();
  if (id && lesson.subjectId) return id === lesson.subjectId;
  const abbrev = normalize(topic.subjectAbbrev);
  const name = normalize(topic.subjectName);
  return Boolean((abbrev && abbrev === normalize(lesson.subjectAbbrev)) ||
    (name && name === normalize(lesson.subjectName)));
}

export function normalizeLessonPeriod(value?: string) {
  const label = normalize(value);
  const number = label.match(/^(?:(?:period|hour) )?(\d+)(?:\.?\s*(?:hod(?:ina)?\.?)?)$/)?.[1];
  return number === undefined ? label : String(Number(number));
}

export function findLessonTopic(
  lesson: Lesson,
  hour: TimetableHour | undefined,
  day: TimetableDay | undefined,
  topics: readonly TeachingTopic[],
): string | undefined {
  if (!day?.date) return undefined;
  const ownTopic = lesson.theme?.trim();
  if (ownTopic) return ownTopic;
  if (!lesson.subjectId && !lesson.subjectAbbrev && !lesson.subjectName) return undefined;

  const period = normalizeLessonPeriod(hour?.caption);
  const matching = topics.filter((topic) =>
    topic.date === day.date && topic.topic?.trim() && sameSubject(topic, lesson));
  const exact = period ? matching.filter((topic) => normalizeLessonPeriod(topic.period) === period) : [];

  const sameSubjectLessons = day.atoms.filter((atom) => sameSubject(atom, lesson));
  const parallelLessons = sameSubjectLessons.filter((atom) => atom.hourId === lesson.hourId);
  const candidates = exact.length
    ? exact
    : sameSubjectLessons.length === 1 ? matching.filter((topic) => !normalizeLessonPeriod(topic.period)) : [];
  if (!candidates.length) return undefined;

  const teacher = normalize(lesson.change?.substituteTeacher || lesson.teacherName || lesson.teacherAbbrev);
  const texts = new Set(candidates.map((topic) => topic.topic.trim()));
  if (texts.size === 1 && parallelLessons.length <= 1) return texts.values().next().value;

  const teacherTopics = new Set(candidates
    .filter((topic) => teacher && normalize(topic.teacher) === teacher)
    .map((topic) => topic.topic.trim()));
  return teacherTopics.size === 1 ? teacherTopics.values().next().value : undefined;
}
