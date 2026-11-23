import { create } from 'zustand';
import {
  SubjectMarks,
  TimetableData,
  Homework,
  KomensMessage,
  SchoolEvent,
  AbsenceSummary,
  AbsenceRecord,
  SubstitutionItem,
  SubjectDetail,
  Mark,
  TestMark,
  TeacherItem,
  StudentItem,
  KomensRecipientGroup,
  KomensMessageTypeInfo,
  TeachingTopic,
} from '../types/bakalari';
import { bakalariApi } from '../api/client';
import { checkInternet, useConnectionFacts } from './connectionFacts';
import {
  MOCK_SUBJECTS_MARKS,
  MOCK_TIMETABLE,
  MOCK_PERMANENT_TIMETABLE,
  MOCK_HOMEWORKS,
  MOCK_MESSAGES,
  MOCK_EVENTS,
  MOCK_ABSENCE_SUMMARY,
  MOCK_ABSENCE_RECORDS,
  MOCK_SUBSTITUTIONS,
  MOCK_SUBJECTS_LIST,
  MOCK_STUDENTS,
  MOCK_MESSAGE_TYPES,
  MOCK_TEACHING_TOPICS,
} from '../api/mockData';
import { sortByDateDesc, getAppDate, getRelevantMondayIso, getNextWeekMondayIso } from '../utils/dateUtils';
import { cleanHtmlToPlainText, hasHtmlMarkup, sanitizeMessageHtml } from '../utils/textUtils';
import { groupConsecutiveEvents } from '../utils/eventUtils';
import { getHolidayInfo } from '../utils/holidayUtils';

import type { MarkOverride } from '../domain/markSimulation';
import { mondayOfTimetable, pruneWeeks } from '../domain/timetableCache';
import { SENT_EXCUSES_KEY } from '../domain/sentExcuses';

export interface SimulatedMark {
  id: string;
  subjectId: string;
  markValue: number;
  weight: number;
  caption: string;
}

const loadCachedData = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to load ${key} from localStorage`, e);
  }
  return fallback;
};

const saveCachedData = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
};

const timetableWeekCache = new Map<string, { data: TimetableData; timestamp: number }>();

const TIMETABLE_WEEKS_KEY = 'b_cache_timetable_weeks';
const MAX_SAVED_TIMETABLE_WEEKS = 8;
let savedTimetableWeeks: Record<string, TimetableData> = {};

/** Remembers a downloaded week under its Monday, in memory and on disk, so it survives a server outage. */
const rememberTimetableWeek = (data: TimetableData | null | undefined) => {
  if (!data?.days?.length) return;
  const monday = mondayOfTimetable(data);
  if (!monday) return;
  timetableWeekCache.set(monday, { data, timestamp: Date.now() });
  savedTimetableWeeks = pruneWeeks({ ...savedTimetableWeeks, [monday]: data }, MAX_SAVED_TIMETABLE_WEEKS, getRelevantMondayIso());
  saveCachedData(TIMETABLE_WEEKS_KEY, savedTimetableWeeks);
};

const loadSavedCustomHomeworks = (): Homework[] => {
  try {
    const saved = localStorage.getItem('b_custom_homeworks');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load custom homeworks from localStorage', e);
  }
  return [];
};

const saveCustomHomeworks = (homeworks: Homework[]) => {
  try {
    localStorage.setItem('b_custom_homeworks', JSON.stringify(homeworks));
  } catch (e) {
    console.error('Failed to save custom homeworks to localStorage', e);
  }
};

// The server's homework list is re-downloaded on every refresh, so the user's
// own "done" ticks are kept locally by homework id and layered on top.
const HOMEWORK_DONE_KEY = 'b_homework_done';

const loadHomeworkDone = (): Record<string, boolean> => {
  try {
    const saved = localStorage.getItem(HOMEWORK_DONE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {};
};

let homeworkDoneOverrides = loadHomeworkDone();

const saveHomeworkDone = () => {
  try {
    localStorage.setItem(HOMEWORK_DONE_KEY, JSON.stringify(homeworkDoneOverrides));
  } catch {}
};

export const getHomeworkDoneOverrides = (): Record<string, boolean> => homeworkDoneOverrides;

const applyHomeworkDone = (list: Homework[]): Homework[] =>
  list.map((hw) => (hw.id in homeworkDoneOverrides ? { ...hw, done: homeworkDoneOverrides[hw.id] } : hw));

const initialCustomHomeworks = loadSavedCustomHomeworks();

const loadSavedTestMarks = (): TestMark[] => {
  try {
    const saved = localStorage.getItem('b_test_marks');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load test marks from localStorage', e);
  }
  return [];
};

const saveTestMarks = (marks: TestMark[]) => {
  try {
    localStorage.setItem('b_test_marks', JSON.stringify(marks));
  } catch (e) {
    console.error('Failed to save test marks to localStorage', e);
  }
};

const initialTestMarks = loadSavedTestMarks();

const loadSavedCustomMessages = (): KomensMessage[] => {
  try {
    const saved = localStorage.getItem('b_custom_messages');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.map((m) => {
          const raw = m.text || '';
          return {
            ...m,
            text: cleanHtmlToPlainText(raw),
            html: m.html ? sanitizeMessageHtml(m.html) : (hasHtmlMarkup(raw) ? sanitizeMessageHtml(raw) : undefined),
          };
        });
      }
    }
  } catch (e) {
    console.error('Failed to load custom messages from localStorage', e);
  }
  return [];
};

const saveCustomMessages = (messages: KomensMessage[]) => {
  try {
    localStorage.setItem('b_custom_messages', JSON.stringify(messages));
  } catch (e) {
    console.error('Failed to save custom messages to localStorage', e);
  }
};

const initialCustomMessages = loadSavedCustomMessages();

interface StoredConfirmation {
  confirmed: boolean;
  confirmedDate?: string;
  recipients?: Array<{ id?: string; name: string; confirmed?: boolean; confirmedDate?: string }>;
}

const loadSavedConfirmations = (): Record<string, StoredConfirmation> => {
  try {
    const saved = localStorage.getItem('b_message_confirmations');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load message confirmations from localStorage', e);
  }
  return {};
};

const saveConfirmations = (data: Record<string, StoredConfirmation>) => {
  try {
    localStorage.setItem('b_message_confirmations', JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save message confirmations to localStorage', e);
  }
};

function cleanTeacherName(name: string): string {
  return name
    .replace(/(?:^(?:Mgr|Ing|PhDr|RNDr|doc|prof|Bc|MUDr|PaedDr|JUDr|ThDr|MgA|BcA|Dis)\.?\s*)+/gi, '')
    .replace(/,\s*(?:Ph\.?D\.?|CSc\.?|DiS\.?|BA|MA|MBA)\b/gi, '')
    .trim();
}

function getTeacherSurname(name: string): string {
  const clean = cleanTeacherName(name);
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return name;
  return parts[parts.length - 1];
}

/** Komens roles of pupils; people who wrote to us as a classmate must not end up in the teacher list. */
export const isStudentRole = (role?: string): boolean => /^\s*(žák|žáci|zak|student|spolužák|spoluzak)/i.test(role || '');

export const extractUnifiedTeachers = (
  isMockMode: boolean,
  sources: {
    komensReceivers?: Array<{ id: string; name: string; role?: string; email?: string }>;
    apiTeachers?: Array<{ id: string; name: string; abbrev?: string; email?: string }>;
    timetableTeachers?: Array<{ id: string; name: string; abbrev?: string }>;
    subjectsList?: SubjectDetail[];
    actualTimetable?: TimetableData;
    permanentTimetable?: TimetableData;
    subjectsMarks?: SubjectMarks[];
    messages?: KomensMessage[];
  }
): TeacherItem[] => {
  const map = new Map<string, TeacherItem>();
  const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

  const addOrUpdate = (item: {
    id?: string;
    name: string;
    role?: string;
    abbrev?: string;
    email?: string;
    subjectName?: string;
  }) => {
    const rawName = item.name?.trim();
    if (
      !rawName ||
      rawName === 'Já' ||
      rawName.toLowerCase() === 'system' ||
      rawName.toLowerCase() === 'systém' ||
      rawName.toLowerCase() === 'vyučující' ||
      rawName.toLowerCase() === 'vyucujici'
    ) return;
    const key = normalize(rawName);
    const itemSurname = getTeacherSurname(rawName).toLowerCase();
    const itemClean = cleanTeacherName(rawName).toLowerCase();

    // Check if exact key exists or an existing teacher with matching surname
    let existingKey = map.has(key) ? key : null;
    if (!existingKey && itemSurname.length >= 3) {
      for (const [k, existing] of map.entries()) {
        const existSurname = getTeacherSurname(existing.name).toLowerCase();
        const existClean = cleanTeacherName(existing.name).toLowerCase();
        if (existSurname === itemSurname) {
          // If one clean name is substring of another (e.g. "Dvořák" vs "Petr Dvořák")
          // or they share abbreviation or subject
          const nameMatches = existClean.includes(itemClean) || itemClean.includes(existClean);
          const subjectMatches = item.subjectName && existing.subjectName && (
            existing.subjectName.toLowerCase().includes(item.subjectName.toLowerCase()) ||
            item.subjectName.toLowerCase().includes(existing.subjectName.toLowerCase())
          );
          const abbrevMatches = item.abbrev && existing.abbrev && item.abbrev.toLowerCase() === existing.abbrev.toLowerCase();

          if (nameMatches || subjectMatches || abbrevMatches) {
            existingKey = k;
            break;
          }
        }
      }
    }

    const existing = existingKey ? map.get(existingKey) : undefined;
    const isClassTeacher = Boolean(
      item.role?.toLowerCase().includes('třídní') ||
      item.role?.toLowerCase().includes('tridni')
    );

    if (!existing) {
      map.set(key, {
        id: item.id || `teacher-${key}`,
        name: rawName,
        role: isClassTeacher
          ? (item.subjectName ? `Třídní učitelka (${item.subjectName})` : 'Třídní učitelka')
          : item.role || (item.subjectName ? `Vyučující (${item.subjectName})` : 'Vyučující'),
        abbrev: item.abbrev,
        email: item.email,
        subjectName: item.subjectName,
      });
    } else {
      // If new name is fuller (more descriptive, e.g. "Mgr. Petr Dvořák" > "Mgr. Dvořák"), upgrade name!
      if (rawName.length > existing.name.length && !existing.name.includes(rawName)) {
        existing.name = rawName;
      }
      if (!existing.email && item.email) existing.email = item.email;
      if (!existing.abbrev && item.abbrev) existing.abbrev = item.abbrev;
      if (item.subjectName && !existing.subjectName) {
        existing.subjectName = item.subjectName;
      } else if (item.subjectName && existing.subjectName && !existing.subjectName.toLowerCase().includes(item.subjectName.toLowerCase())) {
        existing.subjectName = `${existing.subjectName}, ${item.subjectName}`;
      }

      // If either has class teacher role, ensure it's marked as class teacher
      if (isClassTeacher || existing.role?.toLowerCase().includes('třídní')) {
        const sub = existing.subjectName || item.subjectName;
        existing.role = sub ? `Třídní učitel (${sub})` : 'Třídní učitel';
      } else if (item.role && (existing.role === 'Vyučující' || !existing.role)) {
        existing.role = item.role;
      }
      if (item.id && (!existing.id || existing.id.startsWith('teacher-'))) {
        existing.id = item.id;
      }
    }
  };

  // 1. Official Komens receivers
  (sources.komensReceivers || []).forEach((r) => {
    if (isStudentRole(r.role)) return;
    addOrUpdate({ id: r.id, name: r.name, role: r.role, email: r.email });
  });

  // 2. Official /api/3/teachers endpoint
  (sources.apiTeachers || []).forEach((t) => {
    addOrUpdate({ id: t.id, name: t.name, abbrev: t.abbrev, email: t.email });
  });

  // 3. Timetable dictionary teachers (actual & permanent)
  (sources.timetableTeachers || []).forEach((t) => {
    addOrUpdate({ id: t.id, name: t.name, abbrev: t.abbrev });
  });
  (sources.actualTimetable?.teachers || []).forEach((t) => {
    addOrUpdate({ id: t.id, name: t.name, abbrev: t.abbrev });
  });
  (sources.permanentTimetable?.teachers || []).forEach((t) => {
    addOrUpdate({ id: t.id, name: t.name, abbrev: t.abbrev });
  });

  // 4. Subjects list (from /api/3/subjects)
  (sources.subjectsList || []).forEach((s) => {
    if (s.teacherName) {
      addOrUpdate({
        name: s.teacherName,
        subjectName: s.name,
        email: s.teacherEmail,
        role: s.name ? `Vyučující (${s.name})` : 'Vyučující',
      });
    }
  });

  // 5. Timetable lesson atoms
  const allTimetableDays = [
    ...(sources.actualTimetable?.days || []),
    ...(sources.permanentTimetable?.days || []),
  ];
  allTimetableDays.forEach((d) => {
    (d.atoms || []).forEach((atom) => {
      if (atom.teacherName) {
        addOrUpdate({
          name: atom.teacherName,
          subjectName: atom.subjectName,
          abbrev: atom.teacherAbbrev,
          role: atom.subjectName ? `Vyučující (${atom.subjectName})` : 'Vyučující',
        });
      }
    });
  });

  // 6. Subjects marks
  (sources.subjectsMarks || []).forEach((sm) => {
    if (sm.teacherName) {
      addOrUpdate({
        name: sm.teacherName,
        subjectName: sm.subjectName,
        role: sm.subjectName ? `Vyučující (${sm.subjectName})` : 'Vyučující',
      });
    }
  });

  // 7. Received messages
  (sources.messages || []).forEach((m) => {
    if (m.type === 'received' && m.sender?.name && !isStudentRole(m.sender.role)) {
      const cleanName = m.sender.name.trim();
      if (cleanName && cleanName.toLowerCase() !== 'vyučující' && cleanName.toLowerCase() !== 'vyucujici') {
        addOrUpdate({
          id: m.sender.id,
          name: cleanName,
          role: m.sender.role || 'Vyučující',
        });
      }
    }
  });

  // 8. If mock mode and empty, populate with mock teachers
  if (map.size === 0 && isMockMode) {
    MOCK_SUBJECTS_LIST.forEach((s) => {
      addOrUpdate({
        id: s.id,
        name: s.teacherName,
        email: s.teacherEmail,
        subjectName: s.name,
        role: s.id === 'CJL' ? 'Třídní učitelka (ČJL)' : `Vyučující (${s.name})`,
      });
    });
  }

  const result = Array.from(map.values());
  result.sort((a, b) => {
    const isClassA = a.role?.toLowerCase().includes('třídní');
    const isClassB = b.role?.toLowerCase().includes('třídní');
    if (isClassA && !isClassB) return -1;
    if (!isClassA && isClassB) return 1;
    return a.name.localeCompare(b.name, 'cs');
  });

  return result;
};

export function enrichSubjectsList(
  apiSubjects: SubjectDetail[],
  sources: {
    marks?: SubjectMarks[];
    actualTimetable?: TimetableData;
    permanentTimetable?: TimetableData;
    teachers?: TeacherItem[];
  }
): SubjectDetail[] {
  const result: SubjectDetail[] = [];
  const byKey = new Map<string, SubjectDetail>();

  const getSubjKey = (abbrev?: string, name?: string) => {
    return (abbrev || name || '').trim().toUpperCase();
  };

  // 1. Populate from apiSubjects
  (apiSubjects || []).forEach((s) => {
    const key = getSubjKey(s.abbrev, s.name);
    if (!key) return;
    const item: SubjectDetail = { ...s };
    byKey.set(key, item);
    result.push(item);
  });

  // 2. Synthesize or supplement from marks (enrolled subjects)
  (sources.marks || []).forEach((m) => {
    const key = getSubjKey(m.subjectAbbrev, m.subjectName);
    if (!key) return;
    if (!byKey.has(key)) {
      const item: SubjectDetail = {
        id: m.subjectId || m.subjectAbbrev || 'SUBJ',
        abbrev: m.subjectAbbrev || m.subjectName || 'PŘ',
        name: m.subjectName || m.subjectAbbrev || 'Předmět',
        teacherName: m.teacherName || '',
      };
      byKey.set(key, item);
      result.push(item);
    } else {
      const existing = byKey.get(key)!;
      if (!existing.teacherName && m.teacherName) {
        existing.teacherName = m.teacherName;
      }
      if ((!existing.name || existing.name === existing.abbrev) && m.subjectName) {
        existing.name = m.subjectName;
      }
    }
  });

  // 3. Supplement from timetable (classrooms and teachers)
  const allDays = [
    ...(sources.actualTimetable?.days || []),
    ...(sources.permanentTimetable?.days || []),
  ];
  const roomCountsBySubj = new Map<string, Map<string, number>>();
  const teacherCountsBySubj = new Map<string, Map<string, number>>();

  allDays.forEach((d) => {
    (d.atoms || []).forEach((atom) => {
      const key = getSubjKey(atom.subjectAbbrev, atom.subjectName);
      if (!key) return;

      const room = (atom.roomAbbrev || atom.roomId || '').trim();
      if (room && room !== '-') {
        if (!roomCountsBySubj.has(key)) roomCountsBySubj.set(key, new Map());
        const rm = roomCountsBySubj.get(key)!;
        rm.set(room, (rm.get(room) || 0) + 1);
      }

      const tName = (atom.teacherName || '').trim();
      if (tName && tName !== '-') {
        if (!teacherCountsBySubj.has(key)) teacherCountsBySubj.set(key, new Map());
        const tm = teacherCountsBySubj.get(key)!;
        tm.set(tName, (tm.get(tName) || 0) + 1);
      }

      if (!byKey.has(key)) {
        const item: SubjectDetail = {
          id: atom.subjectId || atom.subjectAbbrev || 'SUBJ',
          abbrev: atom.subjectAbbrev || atom.subjectName || 'PŘ',
          name: atom.subjectName || atom.subjectAbbrev || 'Předmět',
          teacherName: atom.teacherName || '',
          classroom: room && room !== '-' ? room : undefined,
        };
        byKey.set(key, item);
        result.push(item);
      }
    });
  });

  // 4. Resolve classrooms and teachers for subjects missing them
  result.forEach((subj) => {
    const key = getSubjKey(subj.abbrev, subj.name);

    if (!subj.classroom && roomCountsBySubj.has(key)) {
      let bestRoom = '';
      let bestCount = 0;
      for (const [r, cnt] of roomCountsBySubj.get(key)!.entries()) {
        if (cnt > bestCount) {
          bestCount = cnt;
          bestRoom = r;
        }
      }
      if (bestRoom) subj.classroom = bestRoom;
    }

    if (!subj.teacherName && teacherCountsBySubj.has(key)) {
      let bestTeacher = '';
      let bestCount = 0;
      for (const [t, cnt] of teacherCountsBySubj.get(key)!.entries()) {
        if (cnt > bestCount) {
          bestCount = cnt;
          bestTeacher = t;
        }
      }
      if (bestTeacher) subj.teacherName = bestTeacher;
    }

    // 5. Enrich teacherEmail, teacherAbbrev, teacherId from unifiedTeachers if missing
    if (subj.teacherName && sources.teachers) {
      const tClean = cleanTeacherName(subj.teacherName).toLowerCase();
      const tSurname = getTeacherSurname(subj.teacherName).toLowerCase();

      const matched = sources.teachers.find((t) => {
        if (subj.teacherId && t.id && t.id === subj.teacherId) return true;
        const existClean = cleanTeacherName(t.name).toLowerCase();
        const existSurname = getTeacherSurname(t.name).toLowerCase();
        if (tSurname.length >= 3 && existSurname === tSurname) {
          return existClean.includes(tClean) || tClean.includes(existClean);
        }
        return false;
      });

      if (matched) {
        if (!subj.teacherEmail && matched.email) {
          subj.teacherEmail = matched.email;
        }
        if (!subj.teacherAbbrev && matched.abbrev) {
          subj.teacherAbbrev = matched.abbrev;
        }
        if (!subj.teacherId && matched.id) {
          subj.teacherId = matched.id;
        }
      }
    }
  });

  // Sort alphabetically by subject name
  result.sort((a, b) => (a.name || a.abbrev).localeCompare(b.name || b.abbrev, 'cs'));
  return result;
}

function reconcileKomensMessages(messages: KomensMessage[]): KomensMessage[] {
  const savedCustom = loadSavedCustomMessages();
  const savedConfirmations = loadSavedConfirmations();

  const reconciledCustom = savedCustom.map((c) => {
    const cleanCTitle = c.title.trim().toLowerCase();
    const serverMatch = messages.find((sm) => {
      if (sm.type !== c.type) return false;
      if (sm.id === c.id) return true;
      const cleanSmTitle = sm.title.trim().toLowerCase();
      const titleMatches = cleanSmTitle === cleanCTitle ||
        (cleanSmTitle.length > 3 && cleanCTitle.length > 3 && (cleanSmTitle.includes(cleanCTitle) || cleanCTitle.includes(cleanSmTitle)));
      if (!titleMatches) return false;
      const dateMatches = sm.date.slice(0, 10) === c.date.slice(0, 10);
      const smRec = (sm.recipientName || '').toLowerCase().trim();
      const cRec = (c.recipientName || '').toLowerCase().trim();
      const recMatches = Boolean(smRec && cRec && (smRec.includes(cRec) || cRec.includes(smRec)));
      return dateMatches || recMatches;
    });

    const titleKey = cleanCTitle ? `title_${c.type}_${cleanCTitle}` : '';
    const savedOverride = savedConfirmations[c.id] || (titleKey ? savedConfirmations[titleKey] : undefined);

    if (serverMatch) {
      const isConfirmed = Boolean(serverMatch.confirmed || c.confirmed || savedOverride?.confirmed);
      return {
        ...c,
        serverId: serverMatch.id,
        confirmed: isConfirmed,
        confirmedDate: serverMatch.confirmedDate || c.confirmedDate || savedOverride?.confirmedDate,
        recipients: serverMatch.recipients || c.recipients || savedOverride?.recipients,
      };
    }

    if (savedOverride) {
      return {
        ...c,
        confirmed: Boolean(c.confirmed || savedOverride.confirmed),
        confirmedDate: c.confirmedDate || savedOverride.confirmedDate,
        recipients: c.recipients || savedOverride.recipients,
      };
    }

    return c;
  });
  saveCustomMessages(reconciledCustom);

  const filteredCustom = reconciledCustom.filter((c) => {
    return !messages.some((m) => {
      if (m.type !== c.type) return false;
      if (m.id === c.id || (c.serverId && m.id === c.serverId)) return true;
      const cleanMTitle = m.title.trim().toLowerCase();
      const cleanCTitle = c.title.trim().toLowerCase();
      return cleanMTitle === cleanCTitle && m.date.slice(0, 10) === c.date.slice(0, 10);
    });
  });

  const isRealApiMode = !bakalariApi.getIsMockMode();
  const finalMessages = [...filteredCustom, ...messages].map((m) => {
    const cleanTitle = m.title.trim().toLowerCase();
    const titleKey = cleanTitle ? `title_${m.type}_${cleanTitle}` : '';
    const override = savedConfirmations[m.id] || (titleKey ? savedConfirmations[titleKey] : undefined);
    if (override?.confirmed && !m.confirmed) {
      if (
        isRealApiMode &&
        (m.type === 'received' || m.type === 'noticeboard') &&
        m.canConfirm === true
      ) {
        delete savedConfirmations[m.id];
        if (titleKey) delete savedConfirmations[titleKey];
        return m;
      }
      return {
        ...m,
        confirmed: true,
        canConfirm: false,
        confirmedDate: override.confirmedDate || m.confirmedDate || new Date().toISOString(),
        recipients: override.recipients || m.recipients,
      };
    }
    return m;
  });
  if (isRealApiMode) {
    saveConfirmations(savedConfirmations);
  }

  if (bakalariApi.getIsMockMode()) {
    finalMessages.forEach((m) => {
      if (m.type === 'sent' && m.requireConfirmation && !m.confirmed) {
        const matchingRecv = finalMessages.find(
          (r) => r.type === 'received' && r.title.trim().toLowerCase() === m.title.trim().toLowerCase()
        );
        if (matchingRecv?.confirmed) {
          m.confirmed = true;
          m.confirmedDate = matchingRecv.confirmedDate || new Date().toISOString();
          if (m.recipients) {
            m.recipients = m.recipients.map((rec) => ({ ...rec, confirmed: true }));
          }
          const titleKey = `title_${m.type}_${m.title.trim().toLowerCase()}`;
          savedConfirmations[m.id] = { confirmed: true, confirmedDate: m.confirmedDate, recipients: m.recipients };
          savedConfirmations[titleKey] = { confirmed: true, confirmedDate: m.confirmedDate, recipients: m.recipients };
          saveConfirmations(savedConfirmations);
        }
      }
    });
  }

  return finalMessages;
}

function extractTopicsFromTimetables(
  actualTimetable?: TimetableData,
  permanentTimetable?: TimetableData,
  currentTopics: TeachingTopic[] = []
): TeachingTopic[] {
  const timetableTopics: TeachingTopic[] = [];
  const allTimetableDaysForTopics = [
    ...(actualTimetable?.days || []),
    ...(permanentTimetable?.days || []),
  ];
  const hoursMap = new Map<number, string>();
  (actualTimetable?.hours || permanentTimetable?.hours || []).forEach((h) => {
    hoursMap.set(h.id, h.caption ? `${h.caption}. hodina` : `${h.id}. hodina`);
  });

  allTimetableDaysForTopics.forEach((day) => {
    (day.atoms || []).forEach((atom) => {
      if (atom.theme && atom.theme.trim()) {
        timetableTopics.push({
          id: atom.id || `atom-topic-${day.date}-${atom.hourId}`,
          date: day.date ? day.date.split('T')[0] : '',
          hour: hoursMap.get(atom.hourId) || (atom.hourId ? `${atom.hourId}. hodina` : ''),
          subjectId: atom.subjectId,
          subjectAbbrev: atom.subjectAbbrev,
          subjectName: atom.subjectName,
          topic: atom.theme.trim(),
          teacher: atom.teacherName,
        });
      }
    });
  });

  const mergedTopicsMap = new Map<string, TeachingTopic>();
  currentTopics.forEach((t) => {
    const key = `${t.date}-${(t.subjectAbbrev || t.subjectName).toUpperCase()}-${t.topic.toLowerCase()}`;
    mergedTopicsMap.set(key, t);
  });
  timetableTopics.forEach((t) => {
    const key = `${t.date}-${(t.subjectAbbrev || t.subjectName).toUpperCase()}-${t.topic.toLowerCase()}`;
    if (!mergedTopicsMap.has(key)) {
      mergedTopicsMap.set(key, t);
    }
  });
  return Array.from(mergedTopicsMap.values()).sort((a, b) => {
    const da = new Date(a.date).getTime() || 0;
    const db = new Date(b.date).getTime() || 0;
    return db - da;
  });
}

interface DataState {
  isLoading: boolean;
  isRefreshing: boolean;
  isTimetableLoading: boolean;
  lastUpdated: number;
  isServerDown: boolean;
  serverErrorMessage: string | null;
  lastSendError: string | null;
  
  // Data

  subjectsMarks: SubjectMarks[];
  timetable: TimetableData;
  actualTimetable: TimetableData;
  nextWeekTimetable: TimetableData;
  permanentTimetable: TimetableData;
  isPermanentFallback: boolean;
  homeworks: Homework[];
  customHomeworks: Homework[];
  testMarks: TestMark[];
  messages: KomensMessage[];
  selectedMessageId: string | null;
  replyToMessageId: string | null;
  events: SchoolEvent[];
  absenceSummary: AbsenceSummary;
  absenceRecords: AbsenceRecord[];
  substitutions: SubstitutionItem[];
  subjectsList: SubjectDetail[];
  teachers: TeacherItem[];
  students: StudentItem[];
  komensMessageTypes: KomensMessageTypeInfo[];
  teachingTopics: TeachingTopic[];
  isTeachingLoading: boolean;
  
  // Grade Predictor Simulations
  simulations: Record<string, SimulatedMark[]>; // subjectId -> simulated marks
  // What-if edits of marks the school recorded, by mark id (kept in memory only)
  markOverrides: Record<string, MarkOverride>;
  
  // Actions
  fetchAllData: (silent?: boolean) => Promise<void>;
  fetchTimetable: (date?: string, permanent?: boolean) => Promise<TimetableData>;
  getCachedTimetableWeek: (date?: string, permanent?: boolean) => TimetableData | null;
  fetchTeachingTopics: (force?: boolean) => Promise<void>;
  getTeachers: () => TeacherItem[];
  getStudents: () => StudentItem[];
  toggleHomeworkDone: (id: string) => void;
  addCustomHomework: (hw: Omit<Homework, 'id' | 'isCustom'>) => void;
  updateCustomHomework: (id: string, hw: Partial<Homework>) => void;
  deleteCustomHomework: (id: string) => void;
  addTestMark: (mark: Omit<TestMark, 'id' | 'createdAt'>) => void;
  updateTestMark: (id: string, updatedFields: Partial<Omit<TestMark, 'id'>>) => void;
  removeTestMark: (id: string) => void;
  markMessageAsRead: (id: string) => void;
  confirmMessage: (id: string) => Promise<boolean>;
  confirmSentMessage: (messageId: string, recipientId?: string) => Promise<boolean>;
  checkMessageConfirmation: (messageId: string) => Promise<boolean>;
  setSelectedMessageId: (id: string | null) => void;
  setReplyToMessageId: (id: string | null) => void;
  sendMessage: (msg: {
    recipientName: string;
    recipientId?: string;
    recipientIds?: string[];
    recipientGroup?: KomensRecipientGroup;
    recipientTypeCode?: string;
    title: string;
    text: string;
    category?: 'message' | 'absence' | 'general' | 'noticeboard';
    messageType?: string;
    requireConfirmation?: boolean;
    senderName?: string;
    senderId?: string;
    draftId?: string;
    isAllDay?: boolean;
    dateFrom?: string;
    dateTo?: string;
    hourFrom?: number | null;
    hourTo?: number | null;
    emailNotification?: boolean;
  }) => Promise<boolean>;
  deleteMessage: (id: string) => void;
  saveDraft: (draft: {
    id?: string;
    recipientName?: string;
    recipientId?: string;
    recipientIds?: string[];
    recipientGroup?: KomensRecipientGroup;
    recipientTypeCode?: string;
    title?: string;
    text?: string;
    category?: 'message' | 'absence' | 'general' | 'noticeboard';
    messageType?: string;
    requireConfirmation?: boolean;
    senderName?: string;
    senderId?: string;
    isAllDay?: boolean;
    dateFrom?: string;
    dateTo?: string;
    hourFrom?: number | null;
    hourTo?: number | null;
    emailNotification?: boolean;
  }) => Promise<string>;
  addSimulatedMark: (subjectId: string, markValue: number, weight: number, caption?: string) => void;
  removeSimulatedMark: (subjectId: string, markId: string) => void;
  clearSimulations: (subjectId?: string) => void;
  setMarkOverride: (markId: string, override: MarkOverride | null) => void;
  getRecentMarks: (limit?: number) => Mark[];
  getUnreadMessagesCount: () => number;
  getActiveHomeworksCount: () => number;
  clearCache: () => void;
  setServerDown: (isDown: boolean, message?: string | null) => void;
}


const isInitialMock = bakalariApi.getIsMockMode();

const cachedActualTimetable = isInitialMock ? MOCK_TIMETABLE : loadCachedData<TimetableData>('b_cache_timetable_actual', { hours: [], days: [] });
const cachedPermanentTimetable = isInitialMock ? MOCK_PERMANENT_TIMETABLE : loadCachedData<TimetableData>('b_cache_timetable_perm', { hours: [], days: [] });
const cachedMarks = isInitialMock ? MOCK_SUBJECTS_MARKS : loadCachedData<SubjectMarks[]>('b_cache_marks', []);
const cachedHomeworks = isInitialMock ? MOCK_HOMEWORKS : loadCachedData<Homework[]>('b_cache_homeworks', []);
const cachedMessages = isInitialMock ? MOCK_MESSAGES : loadCachedData<KomensMessage[]>('b_cache_messages', []);
const cachedEvents = isInitialMock ? groupConsecutiveEvents(MOCK_EVENTS) : loadCachedData<SchoolEvent[]>('b_cache_events', []);
const cachedAbsenceSummary = isInitialMock ? MOCK_ABSENCE_SUMMARY : loadCachedData<AbsenceSummary>('b_cache_absence_summary', { excusedHours: 0, unexcusedHours: 0, lateArrivals: 0, schoolEvents: 0, percentage: 100 });
const cachedAbsenceRecords = isInitialMock ? MOCK_ABSENCE_RECORDS : loadCachedData<AbsenceRecord[]>('b_cache_absence_records', []);
const cachedSubstitutions = isInitialMock ? MOCK_SUBSTITUTIONS : loadCachedData<SubstitutionItem[]>('b_cache_substitutions', []);
const cachedSubjects = isInitialMock ? MOCK_SUBJECTS_LIST : loadCachedData<SubjectDetail[]>('b_cache_subjects', []);
const cachedTeachers = isInitialMock ? extractUnifiedTeachers(true, { subjectsList: MOCK_SUBJECTS_LIST, messages: MOCK_MESSAGES }) : loadCachedData<TeacherItem[]>('b_cache_teachers', []);
const cachedStudents = isInitialMock ? MOCK_STUDENTS : loadCachedData<StudentItem[]>('b_cache_students', []);
const cachedMessageTypes = isInitialMock ? MOCK_MESSAGE_TYPES : loadCachedData<KomensMessageTypeInfo[]>('b_cache_message_types', []);
const cachedNextWeekTimetable = isInitialMock ? MOCK_TIMETABLE : loadCachedData<TimetableData>('b_cache_timetable_next', { hours: [], days: [] });

const cachedLastUpdated = Number(localStorage.getItem('b_cache_last_updated') || 0);

const initialActualAtoms = (cachedActualTimetable?.days || []).reduce((acc, d) => acc + (d.atoms?.length || 0), 0);
const initialPermAtoms = (cachedPermanentTimetable?.days || []).reduce((acc, d) => acc + (d.atoms?.length || 0), 0);
const initialIsPermFallback = initialActualAtoms === 0 && initialPermAtoms > 0;
const initialTimetable = initialIsPermFallback ? cachedPermanentTimetable : cachedActualTimetable;

if (!isInitialMock) {
  const saved = loadCachedData<Record<string, TimetableData>>(TIMETABLE_WEEKS_KEY, {});
  for (const [monday, data] of Object.entries(saved)) {
    if (data?.days?.length) {
      savedTimetableWeeks[monday] = data;
      timetableWeekCache.set(monday, { data, timestamp: 0 });
    }
  }
  // Caches written before weeks were saved separately: file them under their real Monday.
  for (const data of [cachedActualTimetable, cachedNextWeekTimetable]) {
    const monday = mondayOfTimetable(data);
    if (monday && !timetableWeekCache.has(monday)) {
      savedTimetableWeeks[monday] = data;
      timetableWeekCache.set(monday, { data, timestamp: cachedLastUpdated });
    }
  }
}
if (cachedActualTimetable?.days?.length) {
  timetableWeekCache.set('actual', { data: cachedActualTimetable, timestamp: cachedLastUpdated });
}
if (cachedPermanentTimetable?.days?.length) {
  const cachedPermTs = Number(localStorage.getItem('b_cache_perm_ts') || 0);
  timetableWeekCache.set('perm', { data: cachedPermanentTimetable, timestamp: cachedPermTs });
}

let isFetchInProgress = false;
let lastFetchStartTime = 0;

export const useDataStore = create<DataState>((set, get) => ({
  isLoading: false,
  isRefreshing: false,
  isTimetableLoading: false,
  isTeachingLoading: false,
  lastUpdated: cachedLastUpdated,
  isServerDown: bakalariApi.isServerOutage(),
  serverErrorMessage: null,
  lastSendError: null,
  setServerDown: (isDown, msg = null) => set({ isServerDown: isDown, serverErrorMessage: msg }),


  subjectsMarks: cachedMarks,
  timetable: initialTimetable,
  actualTimetable: cachedActualTimetable,
  nextWeekTimetable: cachedNextWeekTimetable,
  permanentTimetable: cachedPermanentTimetable,
  isPermanentFallback: initialIsPermFallback,
  homeworks: [...initialCustomHomeworks, ...applyHomeworkDone(isInitialMock ? MOCK_HOMEWORKS : cachedHomeworks)],
  customHomeworks: initialCustomHomeworks,
  testMarks: initialTestMarks,
  messages: sortByDateDesc([...initialCustomMessages, ...(isInitialMock ? MOCK_MESSAGES : cachedMessages)]),
  selectedMessageId: null,
  replyToMessageId: null,
  events: cachedEvents,
  absenceSummary: cachedAbsenceSummary,
  absenceRecords: cachedAbsenceRecords,
  substitutions: cachedSubstitutions,
  subjectsList: cachedSubjects,
  teachers: cachedTeachers,
  students: cachedStudents,
  komensMessageTypes: cachedMessageTypes,
  teachingTopics: isInitialMock ? MOCK_TEACHING_TOPICS : loadCachedData<TeachingTopic[]>('b_cache_teaching_topics', []),
  simulations: {},
  markOverrides: {},

  getTeachers: () => {
    const current = get().teachers;
    if (current && current.length > 0) return current;
    return extractUnifiedTeachers(bakalariApi.getIsMockMode(), {
      subjectsList: get().subjectsList,
      actualTimetable: get().actualTimetable,
      permanentTimetable: get().permanentTimetable,
      subjectsMarks: get().subjectsMarks,
      messages: get().messages,
    });
  },

  getStudents: () => {
    const current = get().students;
    if (current && current.length > 0) return current;
    if (bakalariApi.getIsMockMode()) return MOCK_STUDENTS;
    return [];
  },

  fetchAllData: async (silent = false) => {
    const nowMs = Date.now();
    // Watchdog reset: if previous fetch hung for > 20s, release lock
    if (isFetchInProgress && nowMs - lastFetchStartTime > 20000) {
      isFetchInProgress = false;
    }

    if (isFetchInProgress) {
      if (silent) return;
    }

    // Throttle silent background refreshes if less than 30s have passed since last SUCCESSFUL update.
    // BUT only throttle if we actually have fresh data (lastUpdated > 0). If lastUpdated is 0 or hours old, NEVER throttle!
    if (silent && get().lastUpdated > 0 && nowMs - get().lastUpdated < 30000) {
      return;
    }

    isFetchInProgress = true;
    lastFetchStartTime = nowMs;

    // When actively refreshing (not silent background check), clear outage state so fresh attempt starts clean
    if (!silent) {
      bakalariApi.setServerOutage(false, '');
      set({ isServerDown: false, serverErrorMessage: null });
    }

    const nowApp = getAppDate();
    const isWeekendNow = nowApp.getDay() === 0 || nowApp.getDay() === 6;
    const initialTimetableDate = isWeekendNow ? getRelevantMondayIso(nowApp, 0) : undefined;
    const nextWeekMondayIso = getNextWeekMondayIso(nowApp);
    const relevantIso = getRelevantMondayIso(nowApp, 0);

    const currentTimetable = get().timetable;
    const currentMonday = currentTimetable?.days?.find((d) => d.dayOfWeek === 1 || d.dayOfWeekName === 'Pondělí') || currentTimetable?.days?.[0];
    const currentMondayIso = currentMonday?.date ? currentMonday.date.split('T')[0] : '';
    // Only mark timetable as actively loading if user is viewing actual week or empty
    const isViewingActualWeek = !currentMondayIso || currentMondayIso === relevantIso || currentTimetable === get().actualTimetable;

    set({
      ...(isViewingActualWeek ? { isTimetableLoading: true } : {}),
      ...(!silent ? { isRefreshing: true } : {}),
    });

    // Track metadata refresh (teachers, receivers, message types) - every 12 hours
    const lastMetaFetch = Number(localStorage.getItem('b_cache_meta_ts') || 0);
    const shouldFetchMeta = (nowMs - lastMetaFetch > 12 * 3600 * 1000) || get().teachers.length === 0;

    let hasAnySuccess = false;
    let hasOutage = false;

    // 1. Core Timetable (Priority 1: Instant display)
    const pTimetable = bakalariApi.getTimetable(initialTimetableDate, false).then((data) => {
      if (data && data.days && data.days.length > 0) {
        hasAnySuccess = true;
        const actualAtoms = (data.days || []).reduce((acc, d) => acc + (d.atoms?.length || 0), 0);
        const permAtoms = (get().permanentTimetable?.days || []).reduce((acc, d) => acc + (d.atoms?.length || 0), 0);
        const hasHolidaysInActual = (data.days || []).some((d) => getHolidayInfo(d).isHoliday);
        const isPerm = actualAtoms === 0 && permAtoms > 0 && !hasHolidaysInActual;
        
        // Re-check current viewing state before updating displayed timetable
        const activeTimetable = get().timetable;
        const activeMonday = activeTimetable?.days?.find((d) => d.dayOfWeek === 1 || d.dayOfWeekName === 'Pondělí') || activeTimetable?.days?.[0];
        const activeMondayIso = activeMonday?.date ? activeMonday.date.split('T')[0] : '';
        const shouldUpdateDisplayedTimetable = !activeMondayIso || activeMondayIso === relevantIso || activeTimetable === get().actualTimetable;

        set({
          actualTimetable: data,
          ...(shouldUpdateDisplayedTimetable ? {
            timetable: isPerm ? get().permanentTimetable : data,
            isPermanentFallback: isPerm,
          } : {}),
          isTimetableLoading: false,
        });
        saveCachedData('b_cache_timetable_actual', data);
        timetableWeekCache.set('actual', { data, timestamp: Date.now() });
        timetableWeekCache.set(relevantIso, { data, timestamp: Date.now() });
        rememberTimetableWeek(data);
      } else {
        set({ isTimetableLoading: false });
      }
      return data;
    }).catch((e) => {
      console.warn('Failed to fetch actual timetable:', e);
      hasOutage = true;
      set({ isTimetableLoading: false });
      return null;
    });

    // 2. Marks (Priority 1: Grades widget)
    const pMarks = bakalariApi.getMarks().then((marks) => {
      if (Array.isArray(marks)) {
        hasAnySuccess = true;
        set({ subjectsMarks: marks });
        saveCachedData('b_cache_marks', marks);
      }
      return marks;
    }).catch((e) => {
      console.warn('Failed to fetch marks:', e);
      hasOutage = true;
      return null;
    });

    // 3. Homeworks
    const pHomeworks = bakalariApi.getHomeworks().then((homeworks) => {
      if (Array.isArray(homeworks)) {
        hasAnySuccess = true;
        const custom = get().customHomeworks;
        // Drop ticks for homework the server no longer lists.
        const listedIds = new Set(homeworks.map((hw) => hw.id));
        const kept = Object.entries(homeworkDoneOverrides).filter(([id]) => listedIds.has(id));
        if (kept.length !== Object.keys(homeworkDoneOverrides).length) {
          homeworkDoneOverrides = Object.fromEntries(kept);
          saveHomeworkDone();
        }
        set({ homeworks: [...custom, ...applyHomeworkDone(homeworks)] });
        saveCachedData('b_cache_homeworks', homeworks);
      }
      return homeworks;
    }).catch((e) => {
      console.warn('Failed to fetch homeworks:', e);
      hasOutage = true;
      return null;
    });

    // 4. Events
    const pEvents = bakalariApi.getEvents().then((events) => {
      if (Array.isArray(events)) {
        hasAnySuccess = true;
        const grouped = groupConsecutiveEvents(events);
        set({ events: grouped });
        saveCachedData('b_cache_events', events);
      }
      return events;
    }).catch((e) => {
      console.warn('Failed to fetch events:', e);
      hasOutage = true;
      return null;
    });

    // 5. Substitutions
    const pSubstitutions = bakalariApi.getSubstitutions().then((substitutions) => {
      if (Array.isArray(substitutions)) {
        hasAnySuccess = true;
        set({ substitutions });
        saveCachedData('b_cache_substitutions', substitutions);
      }
      return substitutions;
    }).catch((e) => {
      console.warn('Failed to fetch substitutions:', e);
      hasOutage = true;
      return null;
    });

    // 6. Absence
    const pAbsence = bakalariApi.getAbsence().then((absence) => {
      if (absence) {
        hasAnySuccess = true;
        set({
          absenceSummary: absence.summary || get().absenceSummary,
          absenceRecords: absence.records || get().absenceRecords,
        });
        if (absence.summary) saveCachedData('b_cache_absence_summary', absence.summary);
        if (absence.records) saveCachedData('b_cache_absence_records', absence.records);
      }
      return absence;
    }).catch((e) => {
      console.warn('Failed to fetch absence:', e);
      hasOutage = true;
      return null;
    });

    // 7. Messages (Komens)
    const pMessages = bakalariApi.getMessages().then((messages) => {
      if (Array.isArray(messages) && messages.length > 0) {
        hasAnySuccess = true;
        const finalMessages = reconcileKomensMessages(messages);
        set({ messages: sortByDateDesc(finalMessages) });
        saveCachedData('b_cache_messages', messages);
      } else if (Array.isArray(messages) && messages.length === 0) {
        // Only overwrite with empty array if there is NO server outage
        if (!bakalariApi.isServerOutage()) {
          const finalMessages = reconcileKomensMessages([]);
          set({ messages: finalMessages });
          saveCachedData('b_cache_messages', []);
        }
      }
      return messages;
    }).catch((e) => {
      console.warn('Failed to fetch messages:', e);
      hasOutage = true;
      return null;
    });

    // 8. Next week timetable (background)
    // The week after the relevant one: on a weekend the relevant week is already the upcoming one.
    const followingWeekMondayIso = getRelevantMondayIso(nowApp, 1);
    const pNextWeek = bakalariApi.getTimetable(followingWeekMondayIso, false).then((nw) => {
      if (nw && nw.days) {
        set({ nextWeekTimetable: nw });
        saveCachedData('b_cache_timetable_next', nw);
        timetableWeekCache.set(followingWeekMondayIso, { data: nw, timestamp: Date.now() });
        rememberTimetableWeek(nw);
      }
      return nw;
    }).catch(() => null);

    // 9. Permanent Timetable (only if empty or older than 24h)
    const lastPermFetch = Number(localStorage.getItem('b_cache_perm_ts') || 0);
    const shouldFetchPerm = get().permanentTimetable.days.length === 0 || (nowMs - lastPermFetch > 24 * 3600 * 1000);
    const pPermanent = shouldFetchPerm
      ? bakalariApi.getTimetable(undefined, true).then((perm) => {
          if (perm && perm.days) {
            set({ permanentTimetable: perm });
            saveCachedData('b_cache_timetable_perm', perm);
            localStorage.setItem('b_cache_perm_ts', String(nowMs));
            timetableWeekCache.set('perm', { data: perm, timestamp: Date.now() });
          }
          return perm;
        }).catch(() => null)
      : Promise.resolve(get().permanentTimetable);

    // 10. Subjects & Metadata (cached for 12 hours)
    const pMeta = shouldFetchMeta
      ? Promise.all([
          bakalariApi.getSubjects().catch(() => []),
          bakalariApi.getTeachers().catch(() => []),
          bakalariApi.getKomensReceivers().catch(() => []),
          bakalariApi.getKomensMessageTypes().catch(() => ({ messageTypes: [], apiStudents: [], apiTeachers: [] })),
        ]).then(([subjects, apiTeachers, komensReceivers, komensTypesData]) => {
          const mergedApiTeachers = [...apiTeachers, ...(komensTypesData?.apiTeachers || [])];
          const unifiedTeachers = extractUnifiedTeachers(bakalariApi.getIsMockMode(), {
            komensReceivers,
            apiTeachers: mergedApiTeachers,
            subjectsList: subjects,
            actualTimetable: get().actualTimetable,
            permanentTimetable: get().permanentTimetable,
            subjectsMarks: get().subjectsMarks,
            messages: get().messages,
          });
          const enrichedSubjects = enrichSubjectsList(subjects, {
            marks: get().subjectsMarks,
            actualTimetable: get().actualTimetable,
            permanentTimetable: get().permanentTimetable,
            teachers: unifiedTeachers,
          });
          const studentsList = (komensTypesData?.apiStudents && komensTypesData.apiStudents.length > 0)
            ? komensTypesData.apiStudents
            : bakalariApi.getIsMockMode() ? MOCK_STUDENTS : [];
          const messageTypesList = (komensTypesData?.messageTypes && komensTypesData.messageTypes.length > 0)
            ? komensTypesData.messageTypes
            : bakalariApi.getIsMockMode() ? MOCK_MESSAGE_TYPES : [];

          set({
            teachers: unifiedTeachers,
            subjectsList: enrichedSubjects,
            students: studentsList,
            komensMessageTypes: messageTypesList,
          });
          saveCachedData('b_cache_teachers', unifiedTeachers);
          saveCachedData('b_cache_subjects', enrichedSubjects);
          saveCachedData('b_cache_students', studentsList);
          saveCachedData('b_cache_message_types', messageTypesList);
          localStorage.setItem('b_cache_meta_ts', String(nowMs));
        }).catch((e) => {
          console.warn('Failed to fetch metadata:', e);
        })
      : Promise.resolve();

    try {
      await Promise.allSettled([
        pTimetable,
        pMarks,
        pHomeworks,
        pEvents,
        pSubstitutions,
        pAbsence,
        pMessages,
        pNextWeek,
        pPermanent,
        pMeta,
      ]);

      const finalTopics = extractTopicsFromTimetables(
        get().actualTimetable,
        get().permanentTimetable,
        get().teachingTopics
      );

      // Server is ONLY declared down if:
      // 1. Not running in mock mode
      // 2. Client device is online (not offline mode)
      // 3. NO core request succeeded (hasAnySuccess === false) AND an outage occurred
      let isClientOnline = (typeof navigator === 'undefined' || navigator.onLine !== false) && useConnectionFacts.getState().online;
      // A refused refresh token fails every request too, but that is a sign-in problem, not an outage.
      const sessionLost = bakalariApi.isSessionExpired();
      const looksLikeOutage = !bakalariApi.getIsMockMode() && isClientOnline && !sessionLost && !hasAnySuccess && (bakalariApi.isServerOutage() || hasOutage);
      // The device may only claim to be online: a school server that fails while the internet is
      // unreachable is the device being offline, not the school having an outage.
      if (looksLikeOutage && !(await checkInternet())) isClientOnline = false;
      if (hasAnySuccess) useConnectionFacts.setState({ online: true });
      const isOutage = looksLikeOutage && isClientOnline;
      const nothingLoaded = !bakalariApi.getIsMockMode() && !hasAnySuccess && (sessionLost || !isClientOnline);

      if (nothingLoaded && !isOutage) {
        // Keep the old "last updated" time: nothing was updated.
        set({
          isServerDown: false,
          serverErrorMessage: null,
          teachingTopics: finalTopics,
          isRefreshing: false,
          isLoading: false,
        });
      } else if (isOutage) {
        set({
          isServerDown: true,
          serverErrorMessage: 'Bakaláři mají výpadek serveru nebo jsou nedostupní.',
          teachingTopics: finalTopics,
          isRefreshing: false,
          isLoading: false,
        });
      } else {
        // Core data succeeded: clear any lingering outage flag from minor failed endpoints
        bakalariApi.setServerOutage(false, '');
        const nowSuccess = Date.now();
        set({
          isServerDown: false,
          serverErrorMessage: null,
          teachingTopics: finalTopics,
          lastUpdated: nowSuccess,
          isRefreshing: false,
          isLoading: false,
        });
        saveCachedData('b_cache_teaching_topics', finalTopics);
        localStorage.setItem('b_cache_last_updated', String(nowSuccess));
      }
    } catch (e) {
      console.error('Failed in fetchAllData:', e);
    } finally {
      isFetchInProgress = false;
      set({ isRefreshing: false, isLoading: false, isTimetableLoading: false });
    }
  },


  fetchTimetable: async (date?: string, permanent: boolean = false) => {
    // "No date" means the relevant week; its Monday is the key, a bare 'actual' entry may be from an older week.
    const cacheKey = permanent ? 'perm' : (date || getRelevantMondayIso());
    const cachedEntry = timetableWeekCache.get(cacheKey);

    // If cached in memory, show it immediately without any loading delay!
    if (cachedEntry) {
      if (permanent) {
        set({ permanentTimetable: cachedEntry.data, isTimetableLoading: false });
      } else {
        set({ timetable: cachedEntry.data, isTimetableLoading: false });
      }
      // If fetched less than 2 minutes ago, return cached data immediately
      if (Date.now() - cachedEntry.timestamp < 120000) {
        return cachedEntry.data;
      }
    } else {

      set({ isTimetableLoading: true });
    }

    try {
      const data = await bakalariApi.getTimetable(date, permanent);
      timetableWeekCache.set(cacheKey, { data, timestamp: Date.now() });
      if (!permanent) rememberTimetableWeek(data);

      if (permanent) {
        set({ permanentTimetable: data, isTimetableLoading: false });
        saveCachedData('b_cache_timetable_perm', data);
      } else {
        const relevantIso = getRelevantMondayIso();
        const nextMondayIso = getNextWeekMondayIso();
        const isDefaultWeek = !date || date === relevantIso;
        const isNextWeek = date === nextMondayIso;
        if (isDefaultWeek) {
          timetableWeekCache.set('actual', { data, timestamp: Date.now() });
          timetableWeekCache.set(relevantIso, { data, timestamp: Date.now() });
          const actualAtoms = (data?.days || []).reduce((acc, d) => acc + (d.atoms?.length || 0), 0);
          const permAtoms = (get().permanentTimetable?.days || []).reduce((acc, d) => acc + (d.atoms?.length || 0), 0);
          const hasHolidaysInActual = (data?.days || []).some((d) => getHolidayInfo(d).isHoliday);
          const isPermanentFallback = actualAtoms === 0 && permAtoms > 0 && !hasHolidaysInActual;
          set({
            actualTimetable: data,
            ...(isNextWeek ? { nextWeekTimetable: data } : {}),
            timetable: isPermanentFallback ? get().permanentTimetable : data,
            isPermanentFallback,
            isTimetableLoading: false,
          });
          saveCachedData('b_cache_timetable_actual', data);
        } else if (isNextWeek) {
          set({
            nextWeekTimetable: data,
            timetable: data,
            isTimetableLoading: false,
          });
          saveCachedData('b_cache_timetable_next', data);
        } else {
          set({ timetable: data, isTimetableLoading: false });
        }
      }
      return data;
    } catch (e) {
      console.error('Failed to fetch timetable:', e);
      set({ isTimetableLoading: false });
      // Saved data was already shown above; without it the caller has to show the error instead of spinning.
      if (cachedEntry) return cachedEntry.data;
      throw e;
    }
  },

  getCachedTimetableWeek: (date?: string, permanent: boolean = false) => {
    const cacheKey = permanent ? 'perm' : (date || getRelevantMondayIso());
    const cachedEntry = timetableWeekCache.get(cacheKey);
    return cachedEntry ? cachedEntry.data : null;
  },

  fetchTeachingTopics: async (force = false) => {
    if (!force && get().teachingTopics.length > 0 && !get().isTeachingLoading) {
      return;
    }
    set({ isTeachingLoading: true });
    try {
      const subjects = get().subjectsList;
      const apiTopics = await bakalariApi.getTeachingTopics(subjects);

      const timetableTopics: TeachingTopic[] = [];
      const allDays = [
        ...(get().actualTimetable?.days || []),
        ...(get().permanentTimetable?.days || []),
        ...(get().timetable?.days || []),
      ];
      const hourCaptions = new Map<number, string>();
      (get().actualTimetable?.hours || get().timetable?.hours || []).forEach((h) => {
        hourCaptions.set(h.id, h.caption ? `${h.caption}. hodina` : `${h.id}. hodina`);
      });

      allDays.forEach((day) => {
        (day.atoms || []).forEach((atom) => {
          if (atom.theme && atom.theme.trim()) {
            timetableTopics.push({
              id: atom.id || `tt-${day.date}-${atom.hourId}`,
              date: day.date ? day.date.split('T')[0] : '',
              hour: hourCaptions.get(atom.hourId) || (atom.hourId ? `${atom.hourId}. hodina` : ''),
              subjectId: atom.subjectId,
              subjectAbbrev: atom.subjectAbbrev,
              subjectName: atom.subjectName,
              topic: atom.theme.trim(),
              teacher: atom.teacherName,
            });
          }
        });
      });

      const mergedMap = new Map<string, TeachingTopic>();
      timetableTopics.forEach((t) => {
        const key = `${t.date}-${(t.subjectAbbrev || t.subjectName).toUpperCase()}-${t.topic.toLowerCase()}`;
        mergedMap.set(key, t);
      });
      apiTopics.forEach((t) => {
        const key = `${t.date}-${(t.subjectAbbrev || t.subjectName).toUpperCase()}-${t.topic.toLowerCase()}`;
        mergedMap.set(key, {
          ...(mergedMap.get(key) || {}),
          ...t,
        });
      });

      let finalTopics = Array.from(mergedMap.values());
      if (finalTopics.length === 0 && bakalariApi.getIsMockMode()) {
        finalTopics = MOCK_TEACHING_TOPICS;
      }

      finalTopics.sort((a, b) => {
        const da = new Date(a.date).getTime() || 0;
        const db = new Date(b.date).getTime() || 0;
        return db - da;
      });

      set({ teachingTopics: finalTopics, isTeachingLoading: false });
    } catch (e) {
      console.error('Failed to fetch teaching topics:', e);
      set({ isTeachingLoading: false });
    }
  },

  toggleHomeworkDone: (id: string) => {
    const target = get().homeworks.find((hw) => hw.id === id);
    if (target && !target.isCustom) {
      homeworkDoneOverrides = { ...homeworkDoneOverrides, [id]: !target.done };
      saveHomeworkDone();
    }
    const updated = get().homeworks.map((hw) =>
      hw.id === id ? { ...hw, done: !hw.done } : hw
    );
    const updatedCustom = get().customHomeworks.map((hw) =>
      hw.id === id ? { ...hw, done: !hw.done } : hw
    );
    saveCustomHomeworks(updatedCustom);
    set({ homeworks: updated, customHomeworks: updatedCustom });
  },

  addCustomHomework: (newHw: Omit<Homework, 'id' | 'isCustom'>) => {
    const customHw: Homework = {
      ...newHw,
      id: 'custom-hw-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      isCustom: true,
      done: newHw.done ?? false,
    };
    const updatedCustom = [customHw, ...get().customHomeworks];
    saveCustomHomeworks(updatedCustom);
    set({
      customHomeworks: updatedCustom,
      homeworks: [customHw, ...get().homeworks],
    });
  },

  updateCustomHomework: (id: string, updatedFields: Partial<Homework>) => {
    const updatedCustom = get().customHomeworks.map((hw) =>
      hw.id === id ? { ...hw, ...updatedFields } : hw
    );
    saveCustomHomeworks(updatedCustom);
    const updatedAll = get().homeworks.map((hw) =>
      hw.id === id ? { ...hw, ...updatedFields } : hw
    );
    set({
      customHomeworks: updatedCustom,
      homeworks: updatedAll,
    });
  },

  deleteCustomHomework: (id: string) => {
    const updatedCustom = get().customHomeworks.filter((hw) => hw.id !== id);
    saveCustomHomeworks(updatedCustom);
    const updatedAll = get().homeworks.filter((hw) => hw.id !== id);
    set({
      customHomeworks: updatedCustom,
      homeworks: updatedAll,
    });
  },

  addTestMark: (mark) => {
    // One test per hour: replace any existing mark for the same date + hour
    const others = get().testMarks.filter(
      (m) => !(m.date === mark.date && m.hourId === mark.hourId)
    );
    const newMark: TestMark = {
      ...mark,
      id: 'test-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      createdAt: Date.now(),
    };
    const updated = [...others, newMark];
    saveTestMarks(updated);
    set({ testMarks: updated });
  },

  updateTestMark: (id, updatedFields) => {
    const updated = get().testMarks.map((m) =>
      m.id === id ? { ...m, ...updatedFields } : m
    );
    saveTestMarks(updated);
    set({ testMarks: updated });
  },

  removeTestMark: (id) => {
    const updated = get().testMarks.filter((m) => m.id !== id);
    saveTestMarks(updated);
    set({ testMarks: updated });
  },

  markMessageAsRead: (id: string) => {
    const target = get().messages.find((m) => m.id === id);
    const updated = get().messages.map((m) =>
      m.id === id ? { ...m, unread: false } : m
    );
    set({ messages: updated });

    // Sync the read state to the Bakaláři server so the official web/mobile app
    // also sees the message as read. Best effort - failures are ignored and the
    // state syncs on the next successful fetch.
    if (
      target &&
      target.unread &&
      (target.type === 'received' || target.type === 'noticeboard') &&
      !/^(sent-|recv-sim-)/.test(target.id) &&
      !bakalariApi.getIsMockMode()
    ) {
      bakalariApi.markMessageAsRead(id).catch(() => {});
    }
  },

  confirmMessage: async (id: string) => {
    // For real server messages the confirmation must be accepted by the Bakaláři
    // server - otherwise the teacher and the official app would never see it.
    // Only mark the message as confirmed locally when the server accepted it.
    const target = get().messages.find((m) => m.id === id);
    const isLocalId = /^(sent-|recv-sim-|draft-)/.test(id);
    const isServerMessage = !isLocalId && (target == null || target.type === 'received' || target.type === 'noticeboard');
    if (isServerMessage && !bakalariApi.getIsMockMode()) {
      const serverOk = await bakalariApi.confirmMessage(id);
      if (!serverOk) {
        console.warn('Bakaláři server did not accept the read confirmation for message', id);
        return false;
      }
      // Confirmation implies the message was read - sync that too (best effort).
      await bakalariApi.markMessageAsRead(id).catch(() => {});
    }
    const now = new Date().toISOString();
    const confirmedMsg = get().messages.find((m) => m.id === id);
    const confirmations = loadSavedConfirmations();

    const updateMsg = (m: KomensMessage) => {
      const isTarget = m.id === id;
      const cleanMTitle = m.title.trim().toLowerCase();
      const cleanTargetTitle = confirmedMsg?.title.trim().toLowerCase() || '';
      const isMatchingSent = confirmedMsg && m.type === 'sent' && (
        (cleanTargetTitle && cleanMTitle === cleanTargetTitle) ||
        (cleanTargetTitle.length > 3 && cleanMTitle.length > 3 && (cleanMTitle.includes(cleanTargetTitle) || cleanTargetTitle.includes(cleanMTitle)))
      );

      if (isTarget || isMatchingSent) {
        const updatedRecipients = m.recipients
          ? m.recipients.map((r) => ({
              ...r,
              confirmed: true,
              confirmedDate: r.confirmedDate || now,
            }))
          : undefined;

        confirmations[m.id] = {
          confirmed: true,
          confirmedDate: m.confirmedDate || now,
          recipients: updatedRecipients,
        };
        if (cleanMTitle) {
          confirmations[`title_${m.type}_${cleanMTitle}`] = {
            confirmed: true,
            confirmedDate: m.confirmedDate || now,
            recipients: updatedRecipients,
          };
        }

        return {
          ...m,
          confirmed: true,
          canConfirm: false,
          confirmedDate: m.confirmedDate || now,
          unread: false,
          recipients: updatedRecipients,
        };
      }
      return m;
    };

    const updated = get().messages.map(updateMsg);
    const custom = loadSavedCustomMessages().map(updateMsg);
    saveCustomMessages(custom);
    saveConfirmations(confirmations);
    set({ messages: updated });
    return true;
  },

  confirmSentMessage: async (messageId: string, recipientId?: string) => {
    const now = new Date().toISOString();
    const confirmations = loadSavedConfirmations();

    const updateMsg = (m: KomensMessage) => {
      const isTarget = m.id === messageId || (m.title && messageId.includes(m.title));
      if (isTarget) {
        let updatedRecipients = m.recipients;
        if (updatedRecipients && updatedRecipients.length > 0) {
          updatedRecipients = updatedRecipients.map((r) => {
            if (!recipientId || r.id === recipientId || r.name === recipientId) {
              return {
                ...r,
                confirmed: true,
                confirmedDate: r.confirmedDate || now,
              };
            }
            return r;
          });
        }
        const allConfirmed = !updatedRecipients || updatedRecipients.every((r) => r.confirmed);
        const result = {
          ...m,
          confirmed: allConfirmed,
          confirmedDate: m.confirmedDate || now,
          recipients: updatedRecipients,
        };

        confirmations[m.id] = {
          confirmed: allConfirmed,
          confirmedDate: result.confirmedDate,
          recipients: updatedRecipients,
        };
        const cleanTitle = m.title.trim().toLowerCase();
        if (cleanTitle) {
          confirmations[`title_${m.type}_${cleanTitle}`] = {
            confirmed: allConfirmed,
            confirmedDate: result.confirmedDate,
            recipients: updatedRecipients,
          };
        }

        return result;
      }
      return m;
    };

    const updated = get().messages.map(updateMsg);
    const custom = loadSavedCustomMessages().map(updateMsg);
    saveCustomMessages(custom);
    saveConfirmations(confirmations);
    set({ messages: updated });
    return true;
  },

  checkMessageConfirmation: async (messageId: string) => {
    const isMock = bakalariApi.getIsMockMode();
    let target = get().messages.find((m) => m.id === messageId);

    // If in mock mode, check if recipient confirmed the simulated incoming message
    if (isMock) {
      if (target && target.type === 'sent' && target.requireConfirmation && !target.confirmed) {
        const matchingRecv = get().messages.find(
          (m) => m.type === 'received' && m.title.trim().toLowerCase() === target!.title.trim().toLowerCase()
        );
        if (matchingRecv?.confirmed) {
          await get().confirmSentMessage(messageId);
          return true;
        }
      }
      return Boolean(target?.confirmed);
    }

    // In real mode, if message has a server ID, directly query the sent message detail
    const tryDetailId = (target && !target.id.startsWith('sent-')) ? target.id : undefined;
    if (tryDetailId) {
      try {
        const detail = await bakalariApi.getSentMessageDetail(tryDetailId);
        if (detail) {
          const recsProcessed = detail.RecipientsProcessed || [];
          const isDetailConfirmed = Boolean(
            detail.Confirmed === true ||
            detail.Read === true ||
            (recsProcessed.length > 0 && (!detail.Recipients || recsProcessed.length >= detail.Recipients.length))
          );
          if (isDetailConfirmed) {
            await get().confirmSentMessage(target!.id);
            return true;
          }
        }
      } catch {}
    }

    // Refresh all data
    await get().fetchAllData(true);

    target = get().messages.find((m) => m.id === messageId);
    if (!target) {
      const saved = loadSavedCustomMessages();
      const customMatch = saved.find((c) => c.id === messageId);
      if (customMatch?.serverId) {
        target = get().messages.find((m) => m.id === customMatch.serverId);
      }
    }

    return Boolean(target?.confirmed);
  },

  setSelectedMessageId: (id) => set({ selectedMessageId: id }),

  setReplyToMessageId: (id) => set({ replyToMessageId: id }),

  sendMessage: async (msg) => {
    const isMock = bakalariApi.getIsMockMode();
    if (!isMock) {
      try {
        set({ lastSendError: null });
        const sendSuccess = await bakalariApi.sendMessage({
          recipientType: msg.recipientTypeCode,
          recipients: msg.recipientIds || (msg.recipientId ? [msg.recipientId] : []),
          recipientName: msg.recipientName,
          title: msg.title,
          text: msg.text,
          category: msg.category,
          messageType: msg.messageType || (msg.category === 'absence' ? 'OMLUVENKA' : msg.category === 'noticeboard' ? 'NASTENKA' : 'OBECNA'),
          requireConfirmation: msg.requireConfirmation,
          isAllDay: msg.isAllDay,
          dateFrom: msg.dateFrom,
          dateTo: msg.dateTo,
          hourFrom: msg.hourFrom,
          hourTo: msg.hourTo,
          emailNotification: msg.emailNotification,
        });
        if (!sendSuccess) {
          set({ lastSendError: 'Nepodařilo se odeslat zprávu.' });
          return false;
        }
      } catch (err: any) {
        console.warn('Real API message send error:', err);
        const errDetail = err?.message || 'Chyba při odesílání zprávy.';
        set({ lastSendError: errDetail });
        return false;
      }
    }


    const senderDisplayName = msg.senderName
      ? `${msg.senderName} (Já)`
      : isMock
      ? 'Jan Novák (Já)'
      : 'Já';

    const recipientNames = (msg.recipientName || '').split(',').map((s) => s.trim()).filter(Boolean);
    const recipientIdsList = msg.recipientIds || (msg.recipientId ? [msg.recipientId] : []);
    const initialRecipients = recipientNames.length > 0
      ? recipientNames.map((name, i) => ({
          id: recipientIdsList[i] || `rec-${i}`,
          name,
          confirmed: false,
        }))
      : [{ id: msg.recipientId || 'rec-1', name: msg.recipientName || 'Příjemce', confirmed: false }];

    const cleanText = cleanHtmlToPlainText(msg.text || '');
    const cleanHtml = hasHtmlMarkup(msg.text || '') ? sanitizeMessageHtml(msg.text || '') : undefined;

    const newMsg: KomensMessage = {
      id: `sent-${Date.now()}`,
      type: 'sent',
      title: msg.title,
      text: cleanText,
      html: cleanHtml,
      sender: {
        id: msg.senderId || 'me',
        name: senderDisplayName,
        role: `Pro: ${msg.recipientName}`,
      },
      recipientName: msg.recipientName,
      recipientGroup: msg.recipientGroup,
      recipientType: msg.recipientTypeCode,
      recipientIds: msg.recipientIds || (msg.recipientId ? [msg.recipientId] : []),
      category: msg.category || 'message',
      requireConfirmation: Boolean(msg.requireConfirmation),
      confirmed: false,
      isAllDay: msg.isAllDay,
      dateFrom: msg.dateFrom,
      dateTo: msg.dateTo,
      hourFrom: msg.hourFrom,
      hourTo: msg.hourTo,
      emailNotification: msg.emailNotification,
      recipients: initialRecipients,
      date: new Date().toISOString(),
      unread: false,
    };

    const newMsgsToAdd: KomensMessage[] = [newMsg];

    if (isMock && msg.category !== 'noticeboard') {
      newMsgsToAdd.push({
        id: `recv-sim-${Date.now()}`,
        type: 'received',
        title: msg.title,
        text: cleanText,
        html: cleanHtml,
        sender: {
          id: 'me',
          name: senderDisplayName,
          role: 'Odesílatel',
        },
        date: new Date().toISOString(),
        unread: true,
        requireConfirmation: Boolean(msg.requireConfirmation),
        confirmed: false,
      });
    }

    if (msg.category === 'noticeboard' || msg.messageType === 'NASTENKA') {
      newMsgsToAdd.push({
        id: `nb-${Date.now()}`,
        type: 'noticeboard',
        title: msg.title,
        text: cleanText,
        html: cleanHtml,
        sender: {
          id: msg.senderId || 'me',
          name: senderDisplayName,
          role: 'Nástěnka třídy',
        },
        recipientName: msg.recipientName,
        recipientGroup: msg.recipientGroup,
        category: 'noticeboard',
        date: new Date().toISOString(),
        unread: false,
      });
    }

    const currentSaved = loadSavedCustomMessages();
    const filteredSaved = msg.draftId ? currentSaved.filter((m) => m.id !== msg.draftId) : currentSaved;
    const updatedSaved = [...newMsgsToAdd, ...filteredSaved];
    saveCustomMessages(updatedSaved);

    set((state) => ({
      messages: sortByDateDesc([
        ...newMsgsToAdd,
        ...state.messages.filter((m) => !msg.draftId || m.id !== msg.draftId),
      ]),
    }));

    return true;
  },

  deleteMessage: (id: string) => {
    const currentSaved = loadSavedCustomMessages();
    const updatedSaved = currentSaved.filter((m) => m.id !== id);
    saveCustomMessages(updatedSaved);

    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
      selectedMessageId: state.selectedMessageId === id ? null : state.selectedMessageId,
    }));
  },

  saveDraft: async (draft) => {
    const isMock = bakalariApi.getIsMockMode();
    const senderDisplayName = draft.senderName
      ? `${draft.senderName} (Já)`
      : isMock
      ? 'Jan Novák (Já)'
      : 'Já';

    const draftId = draft.id && draft.id.startsWith('draft-') ? draft.id : `draft-${Date.now()}`;
    const cleanText = cleanHtmlToPlainText(draft.text || '');
    const cleanHtml = hasHtmlMarkup(draft.text || '') ? sanitizeMessageHtml(draft.text || '') : undefined;

    const recipientNames = (draft.recipientName || '').split(',').map((s) => s.trim()).filter(Boolean);
    const recipientIdsList = draft.recipientIds || (draft.recipientId ? [draft.recipientId] : []);
    const initialRecipients = recipientNames.length > 0
      ? recipientNames.map((name, i) => ({
          id: recipientIdsList[i] || `rec-${i}`,
          name,
          confirmed: false,
        }))
      : draft.recipientName
      ? [{ id: draft.recipientId || 'rec-1', name: draft.recipientName, confirmed: false }]
      : undefined;

    const draftMsg: KomensMessage = {
      id: draftId,
      type: 'draft',
      title: draft.title?.trim() || '(Koncept bez názvu)',
      text: cleanText,
      html: cleanHtml,
      sender: {
        id: draft.senderId || 'me',
        name: senderDisplayName,
        role: draft.recipientName ? `Pro: ${draft.recipientName}` : 'Koncept',
      },
      recipientName: draft.recipientName || undefined,
      recipientGroup: draft.recipientGroup,
      recipientType: draft.recipientTypeCode,
      recipientIds: recipientIdsList,
      category: draft.category || 'message',
      requireConfirmation: Boolean(draft.requireConfirmation),
      confirmed: false,
      isAllDay: draft.isAllDay,
      dateFrom: draft.dateFrom,
      dateTo: draft.dateTo,
      hourFrom: draft.hourFrom,
      hourTo: draft.hourTo,
      emailNotification: draft.emailNotification,
      recipients: initialRecipients,
      date: new Date().toISOString(),
      unread: false,
    };

    const currentSaved = loadSavedCustomMessages().filter((m) => m.id !== draftId);
    const updatedSaved = [draftMsg, ...currentSaved];
    saveCustomMessages(updatedSaved);

    set((state) => ({
      messages: sortByDateDesc([draftMsg, ...state.messages.filter((m) => m.id !== draftId)]),
    }));

    return draftId;
  },

  addSimulatedMark: (subjectId: string, markValue: number, weight: number, caption = 'Simulovaná známka') => {
    const current = get().simulations[subjectId] || [];
    const newSim: SimulatedMark = {
      id: 'sim-' + Math.random().toString(36).substring(2, 9),
      subjectId,
      markValue,
      weight,
      caption,
    };
    set({
      simulations: {
        ...get().simulations,
        [subjectId]: [...current, newSim],
      },
    });
  },

  removeSimulatedMark: (subjectId: string, markId: string) => {
    const current = get().simulations[subjectId] || [];
    set({
      simulations: {
        ...get().simulations,
        [subjectId]: current.filter((s) => s.id !== markId),
      },
    });
  },

  clearSimulations: (subjectId?: string) => {
    if (subjectId) {
      const updated = { ...get().simulations };
      delete updated[subjectId];
      const subject = get().subjectsMarks.find((s) => s.subjectId === subjectId);
      const ids = new Set((subject?.marks || []).map((m) => m.id));
      const overrides = Object.fromEntries(
        Object.entries(get().markOverrides).filter(([id]) => !ids.has(id))
      );
      set({ simulations: updated, markOverrides: overrides });
    } else {
      set({ simulations: {}, markOverrides: {} });
    }
  },

  setMarkOverride: (markId, override) => {
    const next = { ...get().markOverrides };
    if (override) next[markId] = override;
    else delete next[markId];
    set({ markOverrides: next });
  },

  getRecentMarks: (limit = 10) => {
    const allMarks: Mark[] = [];
    get().subjectsMarks.forEach((s) => {
      s.marks.forEach((m) => {
        allMarks.push({
          ...m,
          subjectAbbrev: s.subjectAbbrev,
          subjectName: s.subjectName,
        });
      });
    });

    // Sort by date descending
    return allMarks
      .sort((a, b) => new Date(b.markDate).getTime() - new Date(a.markDate).getTime())
      .slice(0, limit);
  },

  getUnreadMessagesCount: () => {
    return get().messages.filter((m) => m.unread).length;
  },

  getActiveHomeworksCount: () => {
    return get().homeworks.filter((h) => !h.done).length;
  },

  clearCache: () => {
    const keysToRemove = [
      'b_cache_timetable_actual',
      'b_cache_timetable_perm',
      'b_cache_timetable_next',
      TIMETABLE_WEEKS_KEY,
      'b_cache_marks',
      'b_cache_homeworks',
      'b_cache_messages',
      'b_cache_events',
      'b_cache_absence_summary',
      'b_cache_absence_records',
      'b_cache_substitutions',
      'b_cache_subjects',
      'b_cache_teachers',
      'b_cache_students',
      'b_cache_message_types',
      'b_cache_teaching_topics',
      'b_cache_meta_ts',
      'b_cache_perm_ts',
      'b_cache_last_updated',
      HOMEWORK_DONE_KEY,
      SENT_EXCUSES_KEY,
    ];
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
    timetableWeekCache.clear();
    savedTimetableWeeks = {};
    homeworkDoneOverrides = {};
    set({
      lastUpdated: 0,
      subjectsMarks: [],
      timetable: { hours: [], days: [] },
      actualTimetable: { hours: [], days: [] },
      nextWeekTimetable: { hours: [], days: [] },
      permanentTimetable: { hours: [], days: [] },
      isPermanentFallback: false,
      homeworks: [],
      messages: [],
      events: [],
      absenceSummary: { excusedHours: 0, unexcusedHours: 0, lateArrivals: 0, schoolEvents: 0, percentage: 100 },
      absenceRecords: [],
      substitutions: [],
      subjectsList: [],
      teachers: [],
      students: [],
      komensMessageTypes: [],
      teachingTopics: [],
      simulations: {},
      markOverrides: {},
      lastSendError: null,
    });
  },
}));


