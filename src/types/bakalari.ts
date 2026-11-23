export interface SchoolInfo {
  id: string;
  name: string;
  schoolUrl: string;
}

export interface Municipality {
  name: string;
  schoolCount: number;
}

export interface MunicipalityResponse {
  name: string;
  schools: SchoolInfo[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
  userId: string;
  schoolUrl: string;
  obtainedAt: number;
}

export interface UserProfile {
  id: string;
  name: string;
  userType: 'student' | 'parent' | 'teacher';
  className: string;
  schoolName: string;
  schoolUrl: string;
  email?: string;
  classTeacherName?: string;
  classTeacherId?: string;
}

export interface Mark {
  id: string;
  markText: string;
  weight: number;
  subjectId: string;
  subjectAbbrev: string;
  subjectName: string;
  caption: string;
  theme?: string;
  markDate: string;
  teacherName?: string;
  isNew?: boolean;
  type?: 'classic' | 'percent' | 'points';
  maxPoints?: number;
  classRankText?: string;
}

export interface SubjectMarks {
  subjectId: string;
  subjectAbbrev: string;
  subjectName: string;
  teacherName: string;
  averageText: string;
  average: number;
  temporaryMark?: string;
  predictedMark?: number;
  marks: Mark[];
}

export interface LessonChange {
  changeSubject?: string;
  changeType: 'Canceled' | 'Added' | 'Removed' | 'RoomChanged' | 'Substitution';
  description: string;
  time?: string;
  title?: string;
  typeAbbrev?: string;
  typeName?: string;
  /** Substitute teacher for Substitution changes (parsed from the change
   * description, e.g. "Suplování: Vedral Jaroslav, 211 (Kt, 119A)") */
  substituteTeacher?: string;
}

export interface Lesson {
  id: string;
  hourId: number;
  subjectId: string;
  subjectAbbrev: string;
  subjectName: string;
  teacherName: string;
  teacherAbbrev: string;
  roomId: string;
  roomAbbrev: string;
  group?: string;
  theme?: string;
  cycle?: 'odd' | 'even' | 'both';
  cycleName?: string;
  cycleIds?: string[];
  change?: LessonChange | null;
  hasChange: boolean;
}

export interface TimetableHour {
  id: number;
  caption: string;
  beginTime: string;
  endTime: string;
}

export interface TimetableCycle {
  id: string;
  name: string;
  abbrev: string;
}

export interface TimetableDay {
  dayOfWeek: number; // 1 = Monday, 5 = Friday
  dayOfWeekName: string;
  date: string; // YYYY-MM-DD
  dayDescription?: string;
  dayType?: 'WorkDay' | 'Celebration' | 'Holiday' | 'DirectorDay' | 'Weekend' | 'Undefined' | string;
  atoms: Lesson[];
}

export interface TimetableData {
  hours: TimetableHour[];
  days: TimetableDay[];
  teachers?: { id: string; name: string; abbrev?: string }[];
  cycles?: TimetableCycle[];
}

export interface TeacherItem {
  id: string;
  name: string;
  role?: string;
  abbrev?: string;
  email?: string;
  subjectName?: string;
}

export interface StudentItem {
  id: string;
  name: string;
  className?: string;
  email?: string;
}

export type KomensRecipientGroup =
  | 'teacher'                // 'U'  - učitel (1 vyučující)
  | 'teacher_groups'         // 'US' - učitelé mých skupin / předmětů
  | 'teachers_all'           // 'UV' - všichni učitelé školy
  | 'teachers_free'          // 'UVV'- volný výběr učitelů (vícenásobný výběr)
  | 'headmastership'         // 'V'  - vedení školy / ředitelství
  | 'student'                // 'Z'  - spolužák / student (1 student)
  | 'students_class'         // 'ZT' - žáci jedné třídy (celá třída)
  | 'students_all'           // 'ZV' - všichni žáci školy
  | 'students_free';         // 'ZVV'- volný výběr studentů (vícenásobný výběr)

export interface KomensRecipientTypeOption {
  code: string;
  name: string;
  typeOfSelection: 'ONE' | 'ZERO' | 'MULTIPLE' | 'FREE';
  recipients?: {
    code: string;
    name: string;
    displayName?: string;
    abbreviation?: string;
    isDefault?: boolean;
  }[];
}

export interface KomensMessageTypeInfo {
  abbreviation: string; // 'OBECNA' | 'OMLUVENKA' | 'NASTENKA'
  name: string;
  superType?: string;
  showConfirmation?: boolean;
  hasTitle?: boolean;
  recipientsTypes?: KomensRecipientTypeOption[];
}

// A user-created "test being written" flag for a concrete timetable hour
// (e.g. Wednesday 2026-09-02, 3rd hour). Persisted locally in localStorage.
export interface TestMark {
  id: string;
  date: string; // YYYY-MM-DD
  hourId: number;
  description: string;
  createdAt: number;
}

export interface Homework {
  id: string;
  subjectId: string;
  subjectAbbrev: string;
  subjectName: string;
  teacherName: string;
  content: string;
  date: string; // assigned date
  deadline: string; // due date
  done: boolean;
  attachmentName?: string;
  attachments?: { id: string; name: string; size?: number }[];
  isCustom?: boolean;
}

export interface KomensSender {
  id: string;
  name: string;
  role?: string;
}

export interface KomensMessage {
  id: string;
  serverId?: string;
  type: 'received' | 'sent' | 'noticeboard' | 'draft';
  title: string;
  text: string;
  html?: string;
  sender: KomensSender;
  recipientName?: string;
  recipientGroup?: KomensRecipientGroup;
  recipientType?: string;
  recipientIds?: string[];
  category?: 'message' | 'absence' | 'general' | 'noticeboard';
  date: string;
  unread: boolean;
  canConfirm?: boolean;
  requireConfirmation?: boolean;
  confirmed?: boolean;
  confirmedDate?: string;
  isAllDay?: boolean;
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: number | null;
  hourTo?: number | null;
  emailNotification?: boolean;
  recipients?: {
    id?: string;
    name: string;
    confirmed?: boolean;
    confirmedDate?: string;
  }[];
  attachments?: {
    id: string;
    name: string;
    size?: number;
  }[];
}

export interface SchoolEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  endDate?: string;
  time?: string;
  location?: string;
  organizer?: string;
  isPast?: boolean;
}

export interface AbsencePerSubjectItem {
  subjectName: string;
  lessonsCount: number;
  base: number;
  late: number;
  soon: number;
  school: number;
  distanceTeaching: number;
  percentage: number;
}

export interface AbsenceRecord {
  id: string;
  date: string;
  lessonHour?: number | string;
  hoursCount?: number;
  /** First and last lesson of the record when the school system tells which lessons. */
  hourFrom?: number;
  hourTo?: number;
  hourLabel?: string;
  subjectAbbrev?: string;
  subjectName?: string;
  type: 'Excused' | 'Unexcused' | 'Late' | 'SchoolEvent' | 'DistanceLearning' | 'Soon' | 'Unsolved';
  typeName?: string;
  note?: string;
}

export interface AbsenceSummary {
  excusedHours: number;
  unexcusedHours: number;
  lateArrivals: number;
  schoolEvents: number;
  percentage: number;
  threshold?: number;
  subjects?: AbsencePerSubjectItem[];
}

export interface SubstitutionItem {
  id: string;
  date: string;
  hour: string;
  period: string;
  className: string;
  subjectAbbrev: string;
  group?: string;
  teacher: string;
  substituteTeacher: string;
  room: string;
  changeType: string;
  description: string;
}

export interface SubjectDetail {
  id: string;
  abbrev: string;
  name: string;
  teacherId?: string;
  teacherName: string;
  teacherAbbrev?: string;
  teacherEmail?: string;
  teacherPhone?: string;
  teacherWeb?: string;
  classroom?: string;
}

export interface TeachingTopic {
  id: string;
  date: string;
  hour: string;
  subjectId: string;
  subjectAbbrev: string;
  subjectName: string;
  topic: string;
  teacher?: string;
  note?: string;
  lessonLabel?: string;
}
