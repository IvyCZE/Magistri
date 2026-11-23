import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useBackDismiss } from '../native/backDismiss';
import {
  ArrowLeft,
  Send,
  User,
  Users,
  Check,
  AlertCircle,
  FileEdit,
  FileText,
  Trash2,
  Tag,
  Search, ChevronDown, ChevronUp,
  X,
  Radio,
  Building,
  GraduationCap,
  CheckSquare,
  Square,
  Info,
  CheckCircle2,
  CloudAlert,
  Calendar,
  Clock,
  Mail,
  Lock,
} from 'lucide-react';

import { useDataStore, isStudentRole } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { formatCzechDate } from '../utils/dateUtils';
import { groupRadius } from '../utils/groupRadius';
import { searchEntry, rankEntries, type SearchEntry } from '../domain/recipientSearch';
import { hourIdOfLesson, parseExcusePrefill } from '../domain/absenceRecords';
import { lessonOfHourId, rememberSentExcuse } from '../domain/sentExcuses';
import { MaterialWavyDivider } from '../components/common/MaterialWavyDivider';

type MessageCategory = 'message' | 'absence' | 'noticeboard';

type PickerIcon = 'users' | 'building' | 'teacher' | 'user';
type PickerItem = {
  id: string;
  label: string;
  subLabel?: string;
  type: 'special' | 'group' | 'individual';
  icon: PickerIcon;
};

type PickerEntry = SearchEntry<PickerItem>;

const PICKER_ICONS = { users: Users, building: Building, teacher: GraduationCap, user: User } as const;

// A school can list hundreds of pupils; rows are memoised and only a page of people is rendered at once.
const PICKER_PAGE = 40;

// API sources can put the same name and class in different orders or use different punctuation.
const nameKey = (name: string) => name.toLowerCase().split(/[\s,]+/).filter(Boolean).sort().join(' ');

const PickerRow = React.memo(function PickerRow({ item, selected, radius, onToggle }: {
  item: PickerItem;
  selected: boolean;
  radius: string;
  onToggle: (item: PickerItem) => void;
}) {
  const Icon = PICKER_ICONS[item.icon];
  return (
    <button
      type="button"
      onClick={() => onToggle(item)}
      className={`w-full text-left px-4 py-2.5 ${radius} flex items-center gap-3 transition-colors hover:bg-m3-surface-container-highest ${selected ? 'bg-m3-surface-container-highest' : 'bg-m3-surface-container-high'}`}
    >
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-m3-primary-container text-m3-on-primary-container">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className={`text-xs sm:text-sm font-bold truncate ${item.type !== 'individual' ? 'text-m3-primary' : 'text-m3-on-surface'}`}>
          {item.label}
        </span>
        {item.subLabel && (
          <span className="text-[10px] text-m3-on-surface-variant truncate">{item.subLabel}</span>
        )}
      </div>
      <div className="shrink-0 ml-2">
        {selected ? <CheckSquare className="w-4 h-4 text-m3-primary" /> : <Square className="w-4 h-4 text-m3-outline" />}
      </div>
    </button>
  );
});

const getTodayIso = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const NewMessagePage: React.FC = () => {
  const {
    messages,
    replyToMessageId,
    setReplyToMessageId,
    sendMessage,
    saveDraft,
    deleteMessage,
    getTeachers,
    getStudents,
    komensMessageTypes,
    actualTimetable,
    isServerDown,
  } = useDataStore();
  const { user } = useAuthStore();
  const { setActiveScreen, t, language } = useSettingsStore();

  const [showOutageDraftModal, setShowOutageDraftModal] = useState(false);
  useBackDismiss(showOutageDraftModal, () => setShowOutageDraftModal(false));


  const storedTeachers = useDataStore((st) => st.teachers);
  const storedStudents = useDataStore((st) => st.students);
  // Without a stored list getTeachers() rebuilds one from several sources, which is too slow to repeat on every render.
  const availableStudents = useMemo(
    () => getStudents(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storedStudents]
  );
  const availableTeachers = useMemo(() => {
    // A pupil may appear both as a message sender and in the pupil list with a class prefix.
    const studentKeys = new Set(availableStudents.map((st) => nameKey(st.name)));
    return getTeachers().filter((tch) => !isStudentRole(tch.role) && !studentKeys.has(nameKey(tch.name)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedTeachers, messages, actualTimetable, availableStudents]);
  const studentSubLabel = (className?: string) => {
    const cls = className || user?.className || '';
    return cls ? `${t('studentSingular')} · ${cls}` : t('studentSingular');
  };

  // Check if replying or opening draft
  const queryParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.hash.split('?')[1] || '')
    : null;
  const queryReplyTo = queryParams?.get('replyTo') || null;
  const queryDraftId = queryParams?.get('draftId') || null;

  const targetReplyId = replyToMessageId || queryReplyTo;
  const replyOriginal = targetReplyId ? messages.find((m) => m.id === targetReplyId) : null;
  const draftOriginal = queryDraftId ? messages.find((m) => m.id === queryDraftId) : null;
  // Opened from an unexcused absence: the form starts as an absence excuse for that day and lessons.
  const [excusePrefill] = useState(() => parseExcusePrefill(queryParams));

  // State
  const [category, setCategory] = useState<MessageCategory>(() => {
    if (excusePrefill) return 'absence';
    if (draftOriginal?.category && ['message', 'absence', 'noticeboard'].includes(draftOriginal.category)) {
      return draftOriginal.category as MessageCategory;
    }
    return 'message';
  });
  // UNIFIED SELECTION STATE
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [requireConfirmation, setRequireConfirmation] = useState(() => {
    if (draftOriginal && draftOriginal.requireConfirmation !== undefined) {
      return Boolean(draftOriginal.requireConfirmation);
    }
    return false;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState<string>(() => {
    if (draftOriginal) return draftOriginal.title === t('draftWithoutTitle') ? '' : draftOriginal.title;
    if (replyOriginal) {
      const orig = replyOriginal.title;
      return orig.toLowerCase().startsWith('re:') ? orig : `Re: ${orig}`;
    }
    return '';
  });

  const [text, setText] = useState<string>(() => {
    if (draftOriginal) return draftOriginal.text || '';
    if (replyOriginal) {
      return `\n\n--- ${t('originalMessageHeader', { name: replyOriginal.sender.name, date: formatCzechDate(replyOriginal.date, 'withTime') })} ---\n${replyOriginal.text}`;
    }
    return '';
  });

  const [isSending, setIsSending] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [successToast, setSuccessToast] = useState(false);
  const [draftToast, setDraftToast] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const timetableHours = React.useMemo(() => {
    if (actualTimetable?.hours && actualTimetable.hours.length > 0) {
      return actualTimetable.hours;
    }
    return [
      { id: 0, caption: '0', beginTime: '06:55', endTime: '07:40' },
      { id: 1, caption: '1', beginTime: '08:00', endTime: '08:45' },
      { id: 2, caption: '2', beginTime: '08:40', endTime: '09:25' },
      { id: 3, caption: '3', beginTime: '09:45', endTime: '10:30' },
      { id: 4, caption: '4', beginTime: '10:40', endTime: '11:25' },
      { id: 5, caption: '5', beginTime: '11:35', endTime: '12:20' },
      { id: 6, caption: '6', beginTime: '12:30', endTime: '13:15' },
      { id: 7, caption: '7', beginTime: '13:25', endTime: '14:10' },
      { id: 8, caption: '8', beginTime: '14:20', endTime: '15:05' },
    ];
  }, [actualTimetable?.hours]);

  const formatHourOption = (hourId: number) => {
    const h = timetableHours.find((item) => item.id === hourId);
    if (h) {
      return `${h.caption} (${h.beginTime}-${h.endTime})`;
    }
    return `${hourId}. hodina`;
  };

  const [absenceIsAllDay, setAbsenceIsAllDay] = useState<boolean>(() => {
    if (draftOriginal && draftOriginal.isAllDay !== undefined) {
      return Boolean(draftOriginal.isAllDay);
    }
    return false;
  });

  const [absenceDateFrom, setAbsenceDateFrom] = useState<string>(() => {
    return excusePrefill?.date || draftOriginal?.dateFrom || getTodayIso();
  });

  const [absenceDateTo, setAbsenceDateTo] = useState<string>(() => {
    return excusePrefill?.date || draftOriginal?.dateTo || getTodayIso();
  });

  const [absenceHourFrom, setAbsenceHourFrom] = useState<number>(() => {
    if (excusePrefill?.hourFrom != null) return hourIdOfLesson(timetableHours, excusePrefill.hourFrom);
    if (draftOriginal?.hourFrom !== undefined && draftOriginal.hourFrom !== null) {
      return draftOriginal.hourFrom;
    }
    return 0;
  });

  const [absenceHourTo, setAbsenceHourTo] = useState<number>(() => {
    if (excusePrefill?.hourTo != null) return hourIdOfLesson(timetableHours, excusePrefill.hourTo);
    if (draftOriginal?.hourTo !== undefined && draftOriginal.hourTo !== null) {
      return draftOriginal.hourTo;
    }
    return 2;
  });

  // The hours of the timetable may arrive after the form opened; until the user picks other lessons the
  // prefilled ones follow them.
  const hoursPickedRef = useRef(false);
  useEffect(() => {
    if (excusePrefill?.hourFrom == null || hoursPickedRef.current) return;
    setAbsenceHourFrom(hourIdOfLesson(timetableHours, excusePrefill.hourFrom));
    setAbsenceHourTo(hourIdOfLesson(timetableHours, excusePrefill.hourTo ?? excusePrefill.hourFrom));
  }, [excusePrefill, timetableHours]);

  const [absenceEmailNotification, setAbsenceEmailNotification] = useState<boolean>(() => {
    return Boolean(draftOriginal?.emailNotification);
  });

  const omluvenkaType = komensMessageTypes.find((mt) => mt.abbreviation === 'OMLUVENKA');

  const omluvenkaAllowedTeachers = React.useMemo(() => {
    const apiRecipients = (omluvenkaType?.recipientsTypes || []).flatMap((rt) => rt.recipients || []);
    if (apiRecipients.length > 0) {
      return apiRecipients.map((r) => {
        const matched = availableTeachers.find(
          (t) => t.id === r.code || t.name.toLowerCase() === (r.displayName || r.name).toLowerCase()
        );
        return {
          id: r.code || (matched?.id && !matched.id.startsWith('teacher-') ? matched.id : '') || user?.classTeacherId || '',
          name: r.displayName || r.name || matched?.name || '',
          role: matched?.role || 'Třídní učitel',
          subjectName: matched?.subjectName,
        };
      });
    }

    if (user?.classTeacherId || user?.classTeacherName) {
      return [{
        id: user.classTeacherId || `teacher-${user.classTeacherName}`,
        name: user.classTeacherName || 'Třídní učitel',
        role: 'Třídní učitel',
      }];
    }

    if (availableTeachers.length > 0) {
      return [availableTeachers[0]];
    }

    return [];
  }, [omluvenkaType, availableTeachers, user]);

  const defaultAbsenceTeacher = React.useMemo(() => {
    return omluvenkaAllowedTeachers[0] || null;
  }, [omluvenkaAllowedTeachers]);

  const selectedAbsenceTeacher = React.useMemo(() => {
    if (omluvenkaAllowedTeachers.length === 0) return null;
    const indiv = selectedIds.find((id) => id.startsWith('indiv:'));
    if (indiv) {
      const rawId = indiv.replace('indiv:', '');
      const match = omluvenkaAllowedTeachers.find((t) => t.id === rawId);
      if (match) return match;
    }
    return omluvenkaAllowedTeachers[0];
  }, [selectedIds, omluvenkaAllowedTeachers]);

  const selectedAbsenceTeacherId = selectedAbsenceTeacher?.id || '';

  const selectedAbsenceTeacherName = selectedAbsenceTeacher
    ? `${selectedAbsenceTeacher.name}${selectedAbsenceTeacher.role ? ` (${selectedAbsenceTeacher.role})` : ''}`
    : '';

  // Compute allowed categories based on API message types
  const activeMessageType = komensMessageTypes.find(mt => {
    if (category === 'message') return mt.abbreviation === 'OBECNA';
    if (category === 'absence') return mt.abbreviation === 'OMLUVENKA';
    if (category === 'noticeboard') return mt.abbreviation === 'NASTENKA';
    return false;
  }) || komensMessageTypes[0] || null;

  const allowedCodes = activeMessageType?.recipientsTypes?.map(rt => rt.code.toUpperCase()) || [];

  const apiTeacherGroups = activeMessageType?.recipientsTypes?.find(rt => rt.code.toUpperCase() === 'US')?.recipients || [];
  const apiStudentGroups = activeMessageType?.recipientsTypes?.find(rt => rt.code.toUpperCase() === 'ZT')?.recipients || [];

  // Sync recipient on initial replyOriginal or draftOriginal
  useEffect(() => {
    if (replyOriginal) {
      const teacherMatch = availableTeachers.find(
        (t) => t.name.toLowerCase() === replyOriginal.sender.name.toLowerCase()
      );
      if (teacherMatch) {
        setSelectedIds([`indiv:${teacherMatch.id}`]);
        return;
      }

      const studentMatch = availableStudents.find(
        (s) => s.name.toLowerCase() === replyOriginal.sender.name.toLowerCase()
      );
      if (studentMatch) {
        setSelectedIds([`indiv:${studentMatch.id}`]);
        return;
      }

      setSelectedIds([`custom:${replyOriginal.sender.name}`]);
    } else if (draftOriginal) {
      if (draftOriginal.recipientIds && draftOriginal.recipientIds.length > 0) {
        const mappedIds = draftOriginal.recipientIds.map((id) => {
          if (id.includes(':')) return id;
          const known = availableTeachers.some((t) => t.id === id) || availableStudents.some((s) => s.id === id);
          return known ? `indiv:${id}` : `custom:${id}`;
        });
        if (mappedIds.length > 0) setSelectedIds(mappedIds);
      } else if (draftOriginal.recipientName) {
        const names = draftOriginal.recipientName.split(',').map((s) => s.trim()).filter(Boolean);
        const mapped = names.map((name) => {
          const tMatch = availableTeachers.find((t) => t.name.toLowerCase() === name.toLowerCase());
          const sMatch = availableStudents.find((s) => s.name.toLowerCase() === name.toLowerCase());
          const match = tMatch || sMatch;
          return match ? `indiv:${match.id}` : `custom:${name}`;
        });
        if (mapped.length > 0) setSelectedIds(mapped);
      }
    }
  }, [replyOriginal, draftOriginal, availableTeachers, availableStudents]);

  // Handle Category Change
  const handleCategoryChange = (newCat: MessageCategory) => {
    setCategory(newCat);
    setErrorMsg(null);
    if (newCat === 'noticeboard') {
      setSelectedIds(['spec:ZT']);
      if (!title) setTitle(t('defaultNoticeboardTitle'));
    } else if (newCat === 'absence') {
      if (omluvenkaAllowedTeachers.length > 0) {
        setSelectedIds([`indiv:${omluvenkaAllowedTeachers[0].id}`]);
      }
    }
  };

  useEffect(() => {
    if (category === 'absence' && omluvenkaAllowedTeachers.length > 0) {
      const currentIndiv = selectedIds.find((id) => id.startsWith('indiv:'))?.replace('indiv:', '');
      const isValid = currentIndiv && omluvenkaAllowedTeachers.some((t) => t.id === currentIndiv);

      if (omluvenkaAllowedTeachers.length === 1) {
        const forcedTarget = `indiv:${omluvenkaAllowedTeachers[0].id}`;
        if (selectedIds.length !== 1 || selectedIds[0] !== forcedTarget) {
          setSelectedIds([forcedTarget]);
        }
      } else if (!isValid) {
        setSelectedIds([`indiv:${omluvenkaAllowedTeachers[0].id}`]);
      }
    }
  }, [category, omluvenkaAllowedTeachers, selectedIds]);

  // Close dropdown only on tap/click outside, preserving open state while scrolling
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    let lastScrollTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchMoved = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (Math.hypot(dx, dy) > 10) {
          touchMoved = true;
          lastScrollTime = Date.now();
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchMoved) {
        lastScrollTime = Date.now();
        return;
      }

      // It was a tap (not a scroll)
      const touch = e.changedTouches[0];
      const target = touch
        ? (document.elementFromPoint(touch.clientX, touch.clientY) as Node | null) || (e.target as Node | null)
        : (e.target as Node | null);

      if (dropdownRef.current && target && !dropdownRef.current.contains(target)) {
        setIsDropdownOpen(false);
      }
    };

    const handleClick = (e: MouseEvent) => {
      // Ignore click if it immediately follows a touch scroll gesture
      if (Date.now() - lastScrollTime < 350) {
        return;
      }

      const target = e.target as Node | null;
      if (dropdownRef.current && target && !dropdownRef.current.contains(target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('click', handleClick);
    };
  }, []);

  const handleBack = () => {
    if (replyToMessageId) setReplyToMessageId(null);
    setActiveScreen('messages');
  };

  // The list is only rebuilt once typing pauses; the input itself stays instant.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    if (!searchQuery) { setDebouncedQuery(''); return; }
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const [peopleLimit, setPeopleLimit] = useState(PICKER_PAGE);
  useEffect(() => setPeopleLimit(PICKER_PAGE), [debouncedQuery]);

  const allowedKey = allowedCodes.join(',');
  // Search strings are prepared once per data change, not on every keystroke.
  const { groupEntries, peopleEntries } = useMemo(() => {
    const allows = (...codes: string[]) => allowedCodes.length === 0 || codes.some((c) => allowedCodes.includes(c));
    const groups: PickerEntry[] = [];
    const addGroup = (item: PickerItem) => groups.push(searchEntry(item));

    // Groups and classes come first, then people, so a search for "3.A" lists the class before its pupils.
    if (allows('ZT')) {
      if (apiStudentGroups.length > 0) {
        apiStudentGroups.forEach(g => addGroup({ id: `group:${g.code}`, label: g.displayName || g.name, subLabel: t('groupOrClass'), type: 'group', icon: 'users' }));
      } else {
        addGroup({ id: 'spec:ZT', label: t('wholeClass', { className: user?.className || 'Class' }), subLabel: t('groupOrClass'), type: 'special', icon: 'users' });
      }
    }
    if (allows('US')) {
      apiTeacherGroups.forEach(g => addGroup({ id: `group:${g.code}`, label: g.displayName || g.name, subLabel: t('teachersGroup'), type: 'group', icon: 'users' }));
      if (apiTeacherGroups.length === 0) {
        addGroup({ id: 'group:my_teachers', label: t('myTeachersGroup'), subLabel: t('groupOrClass'), type: 'group', icon: 'users' });
      }
    }
    if (allows('UV')) addGroup({ id: 'spec:UV', label: t('allTeachers'), subLabel: t('wholeSchool'), type: 'special', icon: 'users' });
    if (allows('V')) addGroup({ id: 'spec:V', label: t('schoolLeadership'), subLabel: 'Management', type: 'special', icon: 'building' });
    if (allows('ZV')) addGroup({ id: 'spec:ZV', label: t('allStudents'), subLabel: t('wholeSchool'), type: 'special', icon: 'users' });

    const people: PickerEntry[] = [];
    if (allows('U', 'UVV')) {
      availableTeachers.forEach(tch => people.push(searchEntry({
        id: `indiv:${tch.id}`,
        label: tch.name,
        subLabel: tch.role || tch.subjectName || t('teacherSingular'),
        type: 'individual',
        icon: 'teacher',
      }, tch.subjectName)));
    }
    if (allows('Z', 'ZVV')) {
      availableStudents.forEach(s => people.push(searchEntry({
        id: `indiv:${s.id}`,
        label: s.name,
        subLabel: studentSubLabel(s.className),
        type: 'individual',
        icon: 'user',
      }, s.className)));
    }
    return { groupEntries: groups, peopleEntries: people };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedKey, activeMessageType, availableTeachers, availableStudents, user?.className, t]);

  // The same id twice would be one recipient shown twice (and React cannot tell such rows apart).
  const uniqueById = (items: PickerItem[]) => {
    const seen = new Set<string>();
    return items.filter((item) => !seen.has(item.id) && !!seen.add(item.id));
  };
  const groupItems = useMemo(() => uniqueById(rankEntries(groupEntries, debouncedQuery)), [groupEntries, debouncedQuery]);
  const peopleItems = useMemo(() => {
    const groupIds = new Set(groupItems.map((g) => g.id));
    return uniqueById(rankEntries(peopleEntries, debouncedQuery)).filter((p) => !groupIds.has(p.id));
  }, [peopleEntries, debouncedQuery, groupItems]);

  const hiddenPeople = Math.max(0, peopleItems.length - peopleLimit);
  const pickerItems: PickerItem[] = useMemo(
    () => [...groupItems, ...peopleItems.slice(0, peopleLimit)],
    [groupItems, peopleItems, peopleLimit]
  );

  type Family = 'teachers' | 'students';
  const teacherGroupCodes = new Set(['my_teachers', ...apiTeacherGroups.map(g => g.code)]);
  const familyOf = (id: string): Family | null => {
    const [kind, raw] = [id.split(':')[0], id.slice(id.indexOf(':') + 1)];
    if (kind === 'spec') return raw === 'UV' || raw === 'V' ? 'teachers' : 'students';
    if (kind === 'group') return teacherGroupCodes.has(raw) ? 'teachers' : 'students';
    if (kind === 'indiv') {
      if (availableTeachers.some(t => t.id === raw) || omluvenkaAllowedTeachers.some(t => t.id === raw)) return 'teachers';
      return 'students';
    }
    return null;
  };

  const handleItemClick = (item: PickerItem) => {
    setSelectedIds(prev => {
      if (prev.includes(item.id)) return prev.filter(id => id !== item.id);

      // Whole-school choices already cover everyone of the same kind, so they replace each other.
      const family = familyOf(item.id);
      if (item.id.startsWith('spec:')) return [...prev.filter(id => familyOf(id) !== family), item.id];
      return [...prev.filter(id => !(id.startsWith('spec:') && familyOf(id) === family)), item.id];
    });
  };

  const itemClickRef = useRef(handleItemClick);
  itemClickRef.current = handleItemClick;
  const onTogglePickerItem = useCallback((item: PickerItem) => itemClickRef.current(item), []);

  const getSelectedCards = () => {
    return selectedIds.map(id => {
      if (id.startsWith('custom:')) {
        const name = id.slice(7);
        return {
          id,
          name,
          sub: t('customRecipient'),
          type: 'U',
          iconType: 'user' as const,
        };
      }
      if (id.startsWith('spec:')) {
        const code = id.split(':')[1];
        let name = '';
        if (code === 'UV') name = t('allTeachers');
        if (code === 'V') name = t('schoolLeadership');
        if (code === 'ZV') name = t('allStudents');
        if (code === 'ZT') name = t('wholeClass', { className: user?.className || '' });
        return { 
          id, 
          name, 
          sub: t('wholeSchool'), 
          type: code, 
          iconType: (code === 'V' ? 'building' : 'users') as 'users' | 'building' | 'user' | 'teacher' 
        };
      }
      if (id.startsWith('group:')) {
        const code = id.split(':')[1];
        if (code === 'my_teachers') return { id, name: t('myTeachersGroup'), sub: t('groupOrClass'), type: 'US', iconType: 'users' as const };
        
        const allGroups = [...apiTeacherGroups, ...apiStudentGroups];
        const g = allGroups.find(ag => ag.code === code);
        const isTeacherGroup = apiTeacherGroups.some(ag => ag.code === code);
        return {
          id,
          name: g?.displayName || g?.name || code,
          sub: t('groupOrClass'),
          type: isTeacherGroup ? 'US' : 'ZT',
          iconType: 'users' as const,
        };
      }
      if (id.startsWith('indiv:')) {
        const indivId = id.split(':')[1];
        const tObj = availableTeachers.find(t => t.id === indivId);
        if (tObj) {
          return { id, name: tObj.name, sub: tObj.role || tObj.subjectName || t('teacherSingular'), type: 'U', iconType: 'teacher' as const };
        }
        const s = availableStudents.find(s => s.id === indivId);
        if (s) {
          return { id, name: s.name, sub: studentSubLabel(s.className), type: 'Z', iconType: 'user' as const };
        }
        const omluvenkaT = omluvenkaAllowedTeachers.find(t => t.id === indivId);
        if (omluvenkaT) {
          return { id, name: omluvenkaT.name, sub: omluvenkaT.role || t('classTeacherBadge'), type: 'U', iconType: 'teacher' as const };
        }
        return { id, name: t('unknownRecipient'), sub: t('recipient'), type: 'U', iconType: 'user' as const };
      }
      return null;
    }).filter(Boolean) as {
      id: string;
      name: string;
      sub: string;
      type: string;
      iconType: 'users' | 'user' | 'teacher' | 'building';
    }[];
  };

  // The server takes one recipient type per message, so a mixed selection is sent as several requests.
  type RecipientBatch = { code: string; ids: string[] };

  const getRecipientSummary = () => {
    const empty = { displayName: '', recipientTypeCode: '', recipientIds: [] as string[], isValid: false, batches: [] as RecipientBatch[] };
    const cards = getSelectedCards();
    if (cards.length === 0) return empty;

    const batches: RecipientBatch[] = [];
    const teacherGroupIds: string[] = [];
    const studentGroupIds: string[] = [];
    const teacherIds: string[] = [];
    const studentIds: string[] = [];

    selectedIds.forEach(id => {
      const raw = id.slice(id.indexOf(':') + 1);
      if (id.startsWith('spec:')) {
        batches.push({ code: raw, ids: [] });
      } else if (id.startsWith('group:')) {
        if (raw === 'my_teachers') {
          availableTeachers
            .filter(t => t.subjectName || t.role?.toLowerCase().includes('třídní'))
            .forEach(t => { if (!teacherIds.includes(t.id)) teacherIds.push(t.id); });
        } else if (familyOf(id) === 'teachers') {
          teacherGroupIds.push(raw);
        } else {
          studentGroupIds.push(raw);
        }
      } else if (id.startsWith('indiv:')) {
        if (category === 'absence' || familyOf(id) === 'teachers') teacherIds.push(raw);
        else studentIds.push(raw);
      }
    });

    if (teacherGroupIds.length > 0) batches.push({ code: 'US', ids: teacherGroupIds });
    if (studentGroupIds.length > 0) batches.push({ code: 'ZT', ids: studentGroupIds });
    if (teacherIds.length > 0) batches.push({ code: teacherIds.length > 1 ? 'UVV' : 'U', ids: teacherIds });
    if (studentIds.length > 0) batches.push({ code: studentIds.length > 1 ? 'ZVV' : 'Z', ids: studentIds });
    // Only recipients typed in by hand: nothing to address, but the message is still allowed through.
    if (batches.length === 0) batches.push({ code: 'U', ids: [] });

    const names = cards.map(c => c.name);
    const displayName = names.length > 3
      ? t('andMoreRecipients', { names: names.slice(0, 2).join(', '), count: names.length - 2 })
      : names.join(', ');

    return {
      displayName,
      recipientTypeCode: category === 'absence' ? 'U' : batches[0].code,
      recipientIds: batches.flatMap(batch => batch.ids),
      isValid: true,
      batches,
    };
  };

  const recipientSummary = getRecipientSummary();

  const handleSaveDraft = async () => {
    const hasContent = (category === 'absence')
      ? (Boolean(text.trim()) || selectedIds.length > 0)
      : (Boolean(title.trim()) || Boolean(text.trim()) || selectedIds.length > 0);

    if (!hasContent) {
      setErrorMsg(t('draftMustContain'));
      return;
    }

    setIsSavingDraft(true);
    setErrorMsg(null);

    const draftAbsenceTitle = category === 'absence'
      ? (title.trim() || `${t('categoryAbsence')} (${formatCzechDate(absenceDateFrom, 'short')})`)
      : title.trim();

    const absenceRecipId = selectedAbsenceTeacherId || (omluvenkaAllowedTeachers[0]?.id ?? '');
    const absenceRecipName = selectedAbsenceTeacher?.name || recipientSummary.displayName;
    const recipientIdsForSave = category === 'absence'
      ? (absenceRecipId ? [`indiv:${absenceRecipId}`] : selectedIds)
      : selectedIds;
    const recipientTypeCodeForSave = category === 'absence'
      ? 'U'
      : (recipientSummary.recipientTypeCode || undefined);
    const recipientNameForSave = category === 'absence'
      ? (absenceRecipName || undefined)
      : (recipientSummary.displayName || undefined);

    try {
      await saveDraft({
        id: draftOriginal?.id || queryDraftId || undefined,
        recipientName: recipientNameForSave,
        recipientTypeCode: recipientTypeCodeForSave,
        recipientIds: recipientIdsForSave,
        title: draftAbsenceTitle,
        text: text.trim(),
        category,
        messageType: category === 'absence' ? 'OMLUVENKA' : (activeMessageType?.abbreviation || 'OBECNA'),
        requireConfirmation: category === 'absence' ? false : requireConfirmation,
        isAllDay: absenceIsAllDay,
        dateFrom: absenceDateFrom,
        dateTo: absenceDateTo,
        hourFrom: absenceIsAllDay ? null : absenceHourFrom,
        hourTo: absenceIsAllDay ? null : absenceHourTo,
        emailNotification: absenceEmailNotification,
      });

      setIsSavingDraft(false);
      setDraftToast(true);
      setTimeout(() => {
        setDraftToast(false);
        handleBack();
      }, 1200);
    } catch (err) {
      console.error('Error saving draft:', err);
      setIsSavingDraft(false);
      setErrorMsg(t('draftSaveFailed'));
    }
  };

  const handleDeleteDraft = () => {
    if (draftOriginal) {
      deleteMessage(draftOriginal.id);
      setActiveScreen('messages');
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientSummary.isValid && category !== 'absence') {
      setErrorMsg(t('selectRecipientWarning'));
      return;
    }
    if (category === 'absence' && !selectedAbsenceTeacherId && omluvenkaAllowedTeachers.length === 0) {
      setErrorMsg(t('selectRecipientWarning'));
      return;
    }
    if (category !== 'absence' && !title.trim()) {
      setErrorMsg(t('fillSubjectWarning'));
      return;
    }
    if (!text.trim()) {
      setErrorMsg(t('fillMessageTextWarning'));
      return;
    }

    setIsSending(true);
    setErrorMsg(null);

    const draftId = draftOriginal?.id || queryDraftId || undefined;
    const finalTitle = category === 'absence'
      ? (title.trim() || t('categoryAbsence'))
      : title.trim();

    let success = false;
    if (category === 'absence') {
      const absenceRecipId = selectedAbsenceTeacherId || (omluvenkaAllowedTeachers[0]?.id ?? '');
      const absenceRecipName = selectedAbsenceTeacher?.name || recipientSummary.displayName;
      success = await sendMessage({
        draftId,
        recipientName: absenceRecipName,
        recipientTypeCode: 'U',
        recipientIds: absenceRecipId ? [absenceRecipId] : recipientSummary.recipientIds,
        title: finalTitle,
        text: text.trim(),
        category,
        messageType: 'OMLUVENKA',
        requireConfirmation: false,
        isAllDay: absenceIsAllDay,
        dateFrom: absenceDateFrom,
        dateTo: absenceDateTo,
        hourFrom: absenceIsAllDay ? null : absenceHourFrom,
        hourTo: absenceIsAllDay ? null : absenceHourTo,
        emailNotification: absenceEmailNotification,
      });
    } else {
      const results: boolean[] = [];
      for (const batch of recipientSummary.batches) {
        results.push(await sendMessage({
          draftId,
          recipientName: recipientSummary.displayName,
          recipientTypeCode: batch.code,
          recipientIds: batch.ids,
          title: finalTitle,
          text: text.trim(),
          category,
          messageType: activeMessageType?.abbreviation || 'OBECNA',
          requireConfirmation,
          isAllDay: absenceIsAllDay,
          dateFrom: absenceDateFrom,
          dateTo: absenceDateTo,
          hourFrom: absenceIsAllDay ? null : absenceHourFrom,
          hourTo: absenceIsAllDay ? null : absenceHourTo,
          emailNotification: absenceEmailNotification,
        }));
      }
      success = results.some(Boolean);
    }

    setIsSending(false);

    if (success) {
      if (category === 'absence') {
        rememberSentExcuse({
          dateFrom: absenceDateFrom,
          dateTo: absenceDateTo,
          allDay: absenceIsAllDay,
          lessonFrom: lessonOfHourId(timetableHours, absenceHourFrom),
          lessonTo: lessonOfHourId(timetableHours, absenceHourTo),
        });
      }
      setSuccessToast(true);
      setTimeout(() => {
        setSuccessToast(false);
        handleBack();
      }, 1500);
    } else {
      const storeErr = useDataStore.getState().lastSendError;
      setErrorMsg(storeErr || t('sendMessageFailed'));
    }
  };


  return (
    <div className="flex flex-col min-h-screen bg-m3-background text-m3-on-background">
      {/* SUCCESS TOAST */}
      {successToast && (
        <div className="top-safe-4 fixed left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 flex items-center gap-2 px-4 py-3 rounded-full bg-emerald-500 text-white font-bold text-sm shadow-xl font-display">
          <CheckCircle2 className="w-5 h-5" />
          <span>{t('messageSentSuccess')}</span>
        </div>
      )}

      {/* DRAFT TOAST */}
      {draftToast && (
        <div className="top-safe-4 fixed left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 flex items-center gap-2 px-4 py-3 rounded-full bg-m3-surface-container-highest text-m3-on-surface font-bold text-sm shadow-xl font-display">
          <FileText className="w-5 h-5 text-m3-primary" />
          <span>{t('draftSavedSuccess')}</span>
        </div>
      )}

      {/* HEADER */}
      <header className="top-below-app-bar sticky z-40 bg-m3-surface/90 backdrop-blur-xl px-4 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleBack}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface m3-pressable transition-colors shrink-0"
            title={t('back')}
            aria-label={t('back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-extrabold font-display text-m3-on-surface truncate leading-tight">
            {draftOriginal ? t('editDraft') : t('newMessage')}
          </h1>
        </div>

        {draftOriginal && (
          <button
            type="button"
            onClick={handleDeleteDraft}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-bold font-display shadow-xs m3-pressable transition-all shrink-0 cursor-pointer"
            title={t('removeShort')}
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>{t('removeShort')}</span>
          </button>
        )}
      </header>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
        <form onSubmit={handleSend} className="max-w-2xl mx-auto flex flex-col gap-6">
          {errorMsg && (
            <div className="p-4 rounded-m3-2xl bg-rose-500/10 flex items-start gap-3 text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-semibold">{errorMsg}</p>
            </div>
          )}

          {isServerDown && (
            <div className="p-4 rounded-m3-2xl bg-amber-500/10 flex items-start gap-3 text-amber-800 dark:text-amber-200">
              <CloudAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="flex flex-col gap-0.5 text-xs sm:text-sm">
                <span className="font-bold">Bakaláři mají momentálně výpadek</span>
                <span className="opacity-90 leading-relaxed">
                  Server školy nebo systém Bakaláři je nedostupný. Zprávu můžete napsat a uložit si ji jako koncept tlačítkem níže. Až systém naběhne, budete ji moci snadno odeslat.
                </span>
              </div>
            </div>
          )}


          {/* 1. TYP ZPRÁVY */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-m3-on-surface-variant font-display">
              {t('messageCategory')}
            </label>

            <div className="flex items-center gap-2 flex-wrap">
              {komensMessageTypes.some(mt => mt.abbreviation === 'OBECNA') && (
                <button
                  type="button"
                  onClick={() => handleCategoryChange('message')}
                  className={`px-4 py-2.5 rounded-full text-xs font-bold font-display transition-all m3-pressable flex items-center gap-2 ${
                    category === 'message'
                      ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                      : 'bg-m3-surface-container-high text-m3-on-surface-variant hover:text-m3-on-surface'
                  }`}
                >
                  <FileEdit className="w-3.5 h-3.5" />
                  <span>{t('categoryStandard')}</span>
                </button>
              )}

              {komensMessageTypes.some(mt => mt.abbreviation === 'OMLUVENKA') && (
                <button
                  type="button"
                  onClick={() => handleCategoryChange('absence')}
                  className={`px-4 py-2.5 rounded-full text-xs font-bold font-display transition-all m3-pressable flex items-center gap-2 ${
                    category === 'absence'
                      ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                      : 'bg-m3-surface-container-high text-m3-on-surface-variant hover:text-m3-on-surface'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>{t('categoryAbsence')}</span>
                </button>
              )}

              {komensMessageTypes.some(mt => mt.abbreviation === 'NASTENKA') && (
                <button
                  type="button"
                  onClick={() => handleCategoryChange('noticeboard')}
                  className={`px-4 py-2.5 rounded-full text-xs font-bold font-display transition-all m3-pressable flex items-center gap-2 ${
                    category === 'noticeboard'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-m3-surface-container-high text-m3-on-surface-variant hover:text-m3-on-surface'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>{t('classNoticeboard')}</span>
                </button>
              )}
            </div>

            {/* Noticeboard Explanatory Banner */}
            {category === 'noticeboard' && (
              <div className="p-3.5 rounded-m3-2xl bg-purple-500/10 text-purple-700 dark:text-purple-300 flex items-start gap-3 mt-1 text-xs">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold">{t('classNoticeboard')}:</span>
                  <span className="opacity-90 leading-relaxed">
                    {t('classNoticeboardDesc')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Wavy divider between message type and recipient scope */}
          {category !== 'noticeboard' && (
            <div className="-my-1">
              <MaterialWavyDivider />
            </div>
          )}

          {/* 2. OKRUH PŘÍJEMCŮ (Receiver Scope Selection) */}
          {category === 'message' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-m3-on-surface-variant font-display">
                  {t('recipientScope')}
                </label>
              </div>

              {/* UNIFIED CHECKLIST PICKER */}
              <div className="flex flex-col gap-2 mt-1" ref={dropdownRef}>
                <div className="relative cursor-pointer" onClick={() => setIsDropdownOpen(true)}>
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-m3-on-surface-variant">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (!isDropdownOpen) setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder={t('searchRecipientsPlaceholder')}
                    className="w-full pl-10 pr-10 py-3 rounded-m3-2xl bg-m3-surface-container-high text-m3-on-surface text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-m3-primary/50 cursor-text"
                  />
                  <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                    {searchQuery ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setSearchQuery(''); }} className="p-1.5 text-m3-on-surface-variant hover:text-m3-on-surface">
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <button type="button" onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="p-1.5 text-m3-on-surface-variant hover:text-m3-on-surface">
                        {isDropdownOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Dropdown list */}
                {isDropdownOpen && (() => {
                  const customName = searchQuery.trim();
                  const rowCount = pickerItems.length + (hiddenPeople > 0 ? 1 : 0) + (customName ? 1 : 0);
                  return (
                    <div key={debouncedQuery} className="max-h-[min(18rem,45dvh)] overflow-y-auto overscroll-contain mt-1 rounded-m3-2xl bg-m3-surface-container shadow-md p-1.5 z-10 relative flex flex-col gap-1">
                      {selectedIds.length > 0 && (
                        <div className="px-3 py-1.5 flex items-center justify-between text-xs font-semibold text-m3-on-surface-variant">
                          <span className="font-bold text-m3-primary">{t('selectedRecipientsCount', { count: selectedIds.length })}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedIds([])}
                            className="text-xs text-rose-500 hover:underline font-bold"
                          >
                            {t('clearSelection')}
                          </button>
                        </div>
                      )}
                      {rowCount === 0 && (
                        <div className="px-4 py-6 text-center text-xs text-m3-on-surface-variant">{t('noResultsFound')}</div>
                      )}
                      {pickerItems.map((item, idx) => (
                        <PickerRow
                          key={item.id}
                          item={item}
                          selected={selectedIds.includes(item.id)}
                          radius={groupRadius(idx, rowCount)}
                          onToggle={onTogglePickerItem}
                        />
                      ))}
                      {hiddenPeople > 0 && (
                        <button
                          type="button"
                          onClick={() => setPeopleLimit(limit => limit + PICKER_PAGE)}
                          className={`w-full text-center px-4 py-3 ${groupRadius(pickerItems.length, rowCount)} bg-m3-surface-container-high hover:bg-m3-surface-container-highest transition-colors text-xs font-bold text-m3-primary`}
                        >
                          {t('showMoreRecipients', { count: hiddenPeople })}
                        </button>
                      )}
                      {customName && (
                        <button
                          type="button"
                          onClick={() => {
                            const customId = `custom:${customName}`;
                            setSelectedIds(prev => prev.includes(customId) ? prev : [...prev.filter(id => !id.startsWith('spec:')), customId]);
                            setSearchQuery('');
                          }}
                          className={`w-full text-left px-4 py-3 ${groupRadius(rowCount - 1, rowCount)} bg-m3-surface-container-high hover:bg-m3-surface-container-highest transition-colors flex items-center gap-3`}
                        >
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-m3-primary-container text-m3-on-primary-container shadow-2xs">
                            <User className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-bold text-m3-primary">{t('addCustomRecipient', { name: customName })}</span>
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Selected Summary Cards */}
                {recipientSummary.isValid && (
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex items-center justify-between px-1 pb-1">
                      <span className="text-xs font-bold text-m3-on-surface-variant">
                        {t('selectedRecipients', { count: getSelectedCards().length })}
                      </span>
                      {getSelectedCards().length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSelectedIds([])}
                          className="text-[11px] font-bold text-rose-500 hover:underline"
                        >
                          {t('removeAll')}
                        </button>
                      )}
                    </div>
                    {getSelectedCards().map((card, cardIndex, cards) => (
                      <div key={card.id} className={`flex items-center justify-between p-3.5 px-4 ${groupRadius(cardIndex, cards.length)} bg-m3-surface-container-high shadow-xs`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-m3-primary-container text-m3-on-primary-container font-extrabold flex items-center justify-center shrink-0 text-sm shadow-2xs">
                            {card.iconType === 'users' ? (
                              <Users className="w-5 h-5"/>
                            ) : card.iconType === 'teacher' ? (
                              <GraduationCap className="w-5 h-5"/>
                            ) : card.iconType === 'building' ? (
                              <Building className="w-5 h-5"/>
                            ) : (
                              <User className="w-5 h-5"/>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-sm text-m3-on-surface truncate">
                              {card.name}
                            </span>
                            <span className="text-xs text-m3-on-surface-variant truncate">
                              {card.sub}
                            </span>
                          </div>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => {
                            setSelectedIds(prev => prev.filter(id => id !== card.id));
                          }}
                          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-rose-500/10 text-m3-on-surface-variant hover:text-rose-500 transition-colors shrink-0 m3-pressable"
                          title={t('removeRecipient')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ABSENCE FORM */}
          {category === 'absence' && (
            <div className="flex flex-col gap-4">
              {/* Omluvenka na */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-m3-on-surface-variant font-display">
                  {t('omluvenkaNa')}
                </label>
                <div className="grid grid-cols-2 p-1 rounded-full bg-m3-surface-container-high">
                  <button
                    type="button"
                    onClick={() => setAbsenceIsAllDay(true)}
                    className={`py-2 px-4 rounded-full text-xs font-bold font-display transition-all m3-pressable text-center ${
                      absenceIsAllDay
                        ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                        : 'text-m3-on-surface-variant hover:text-m3-on-surface'
                    }`}
                  >
                    {t('wholeDay')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbsenceIsAllDay(false)}
                    className={`py-2 px-4 rounded-full text-xs font-bold font-display transition-all m3-pressable text-center ${
                      !absenceIsAllDay
                        ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                        : 'text-m3-on-surface-variant hover:text-m3-on-surface'
                    }`}
                  >
                    {t('lessonHour')}
                  </button>
                </div>
              </div>

              {/* Od / Do grid */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {/* OD */}
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-m3-on-surface-variant font-display">
                    {t('dateFrom')}
                  </label>
                  {/* Date picker */}
                  <div className="relative">
                    <div className="flex items-center justify-between px-2.5 sm:px-3.5 py-3 rounded-m3-2xl bg-m3-surface-container-high text-xs sm:text-sm font-bold text-m3-on-surface gap-1">
                      <div className="flex items-center gap-1.5 sm:gap-2 truncate">
                        <Calendar className="w-4 h-4 text-m3-primary shrink-0" />
                        <span className="truncate">{formatCzechDate(absenceDateFrom, 'full')}</span>
                      </div>
                      <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-m3-on-surface-variant shrink-0" />
                    </div>
                    <input
                      type="date"
                      value={absenceDateFrom}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAbsenceDateFrom(val);
                        if (val > absenceDateTo) {
                          setAbsenceDateTo(val);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>

                  {/* Hour picker (if !absenceIsAllDay) */}
                  {!absenceIsAllDay && (
                    <div className="relative">
                      <div className="flex items-center justify-between px-2.5 sm:px-3.5 py-3 rounded-m3-2xl bg-m3-surface-container-high text-xs sm:text-sm font-bold text-m3-on-surface gap-1">
                        <div className="flex items-center gap-1.5 sm:gap-2 truncate">
                          <Clock className="w-4 h-4 text-m3-primary shrink-0" />
                          <span className="truncate">
                            {formatHourOption(absenceHourFrom)}
                          </span>
                        </div>
                        <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-m3-on-surface-variant shrink-0" />
                      </div>
                      <select
                        value={absenceHourFrom}
                        onChange={(e) => {
                          const newFrom = Number(e.target.value);
                          hoursPickedRef.current = true;
                          setAbsenceHourFrom(newFrom);
                          if (newFrom > absenceHourTo) {
                            setAbsenceHourTo(newFrom);
                          }
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-m3-on-surface bg-m3-surface-container-highest"
                      >
                        {timetableHours.map((h) => (
                          <option key={`from-${h.id}`} value={h.id}>
                            {h.caption} ({h.beginTime}-{h.endTime})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* DO */}
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-m3-on-surface-variant font-display">
                    {t('dateTo')}
                  </label>
                  {/* Date picker */}
                  <div className="relative">
                    <div className="flex items-center justify-between px-2.5 sm:px-3.5 py-3 rounded-m3-2xl bg-m3-surface-container-high text-xs sm:text-sm font-bold text-m3-on-surface gap-1">
                      <div className="flex items-center gap-1.5 sm:gap-2 truncate">
                        <Calendar className="w-4 h-4 text-m3-primary shrink-0" />
                        <span className="truncate">{formatCzechDate(absenceDateTo, 'full')}</span>
                      </div>
                      <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-m3-on-surface-variant shrink-0" />
                    </div>
                    <input
                      type="date"
                      value={absenceDateTo}
                      min={absenceDateFrom}
                      onChange={(e) => setAbsenceDateTo(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>

                  {/* Hour picker (if !absenceIsAllDay) */}
                  {!absenceIsAllDay && (
                    <div className="relative">
                      <div className="flex items-center justify-between px-2.5 sm:px-3.5 py-3 rounded-m3-2xl bg-m3-surface-container-high text-xs sm:text-sm font-bold text-m3-on-surface gap-1">
                        <div className="flex items-center gap-1.5 sm:gap-2 truncate">
                          <Clock className="w-4 h-4 text-m3-primary shrink-0" />
                          <span className="truncate">
                            {formatHourOption(absenceHourTo)}
                          </span>
                        </div>
                        <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-m3-on-surface-variant shrink-0" />
                      </div>
                      <select
                        value={absenceHourTo}
                        onChange={(e) => {
                          hoursPickedRef.current = true;
                          setAbsenceHourTo(Number(e.target.value));
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-m3-on-surface bg-m3-surface-container-highest"
                      >
                        {timetableHours.map((h) => (
                          <option key={`to-${h.id}`} value={h.id}>
                            {h.caption} ({h.beginTime}-{h.endTime})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Příjemce (Forced Class Teacher) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-m3-on-surface-variant font-display">
                  {t('recipientSingular')}
                </label>
                {omluvenkaAllowedTeachers.length <= 1 ? (
                  <div className="flex items-center justify-between p-3.5 px-4 rounded-m3-2xl bg-m3-surface-container-high shadow-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-m3-primary-container text-m3-on-primary-container font-extrabold flex items-center justify-center shrink-0 text-sm shadow-2xs">
                        <GraduationCap className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-sm text-m3-on-surface truncate">
                          {selectedAbsenceTeacher?.name || t('classTeacherBadge')}
                        </span>
                        <span className="text-xs text-m3-on-surface-variant truncate">
                          {selectedAbsenceTeacher?.role || t('classTeacherBadge')}
                        </span>
                      </div>
                    </div>
                    <div className="p-1 text-m3-on-surface-variant/40 shrink-0" title={t('classTeacherBadge')}>
                      <Lock className="w-4 h-4" />
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center justify-between p-3.5 px-4 rounded-m3-2xl bg-m3-surface-container-high shadow-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-m3-primary-container text-m3-on-primary-container font-extrabold flex items-center justify-center shrink-0 text-sm shadow-2xs">
                          <GraduationCap className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-sm text-m3-on-surface truncate">
                            {selectedAbsenceTeacherName || t('selectRecipient')}
                          </span>
                          <span className="text-xs text-m3-on-surface-variant truncate">
                            {selectedAbsenceTeacher?.role || t('classTeacherBadge')}
                          </span>
                        </div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-m3-on-surface-variant shrink-0" />
                    </div>
                    <select
                      value={selectedAbsenceTeacherId}
                      onChange={(e) => {
                        const newId = e.target.value;
                        setSelectedIds(newId ? [`indiv:${newId}`] : []);
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-m3-on-surface bg-m3-surface-container-highest"
                    >
                      {omluvenkaAllowedTeachers.map((tch) => (
                        <option key={`tch-${tch.id}`} value={tch.id}>
                          {tch.name} {tch.role ? `(${tch.role})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Upozornit příjemce emailem */}
              <label className="flex items-center gap-3 py-1 cursor-pointer transition-colors m3-pressable select-none">
                <input
                  type="checkbox"
                  checked={absenceEmailNotification}
                  onChange={(e) => setAbsenceEmailNotification(e.target.checked)}
                  className="w-4 h-4 rounded text-m3-primary focus:ring-m3-primary/50 accent-m3-primary cursor-pointer"
                />
                <span className="text-xs font-semibold text-m3-on-surface-variant italic">
                  {t('notifyEmail')}
                </span>
              </label>
            </div>
          )}

          {category === 'noticeboard' && (
             <div className="flex items-center justify-between p-4 rounded-m3-2xl bg-m3-surface-container-high shadow-xs">
             <div className="flex items-center gap-3.5 min-w-0">
               <div className="w-11 h-11 rounded-full bg-m3-primary-container text-m3-on-primary-container font-extrabold flex items-center justify-center shrink-0 shadow-2xs">
                 <Users className="w-5 h-5" />
               </div>
               <div className="flex flex-col min-w-0">
                 <div className="flex items-center gap-2 flex-wrap">
                   <span className="font-extrabold text-sm sm:text-base text-m3-on-surface">
                     {t('classNoticeboardTitle', { className: user?.className || '3.B' })}
                   </span>
                   <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-m3-primary/20 text-m3-primary uppercase tracking-wide">
                     {t('noticeboardBadge')}
                   </span>
                 </div>
                 <span className="text-xs text-m3-on-surface-variant mt-0.5 flex items-center gap-1.5">
                   <Check className="w-3.5 h-3.5 text-emerald-500" />
                   <span className="text-emerald-600 dark:text-emerald-400 font-bold">{t('ready')}</span>
                   • {t('noticeboardDeliveryNotice')}
                 </span>
               </div>
             </div>
           </div>
          )}

          {/* 4. TITLE (Hidden for absence messages) */}
          {category !== 'absence' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-m3-on-surface-variant font-display">
                {t('subjectLabelRequired')}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={category === 'noticeboard' ? t('noticeboardSubjectPlaceholder') : t('messageSubjectPlaceholder')}
                className="w-full px-4 py-3.5 rounded-m3-2xl bg-m3-surface-container-high text-m3-on-surface text-sm font-bold focus:outline-none focus:ring-2 focus:ring-m3-primary/50"
              />
            </div>
          )}

          {/* 5. TEXT */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-m3-on-surface-variant font-display flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-m3-primary" />
              <span>{t('messageTextRequired')}</span>
              <span className="text-rose-500 font-extrabold text-sm">*</span>
            </label>
            <textarea
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                category === 'absence'
                  ? (t('startWritingPlaceholder') || 'Začněte psát...')
                  : category === 'noticeboard'
                  ? t('noticeboardTextPlaceholder')
                  : t('typeMessagePlaceholder')
              }
              className="w-full p-4 rounded-m3-2xl bg-m3-surface-container-high text-m3-on-surface text-sm font-medium focus:outline-none focus:ring-2 focus:ring-m3-primary/50 resize-y min-h-[160px] leading-relaxed"
            />
          </div>

          {/* 6. CONFIRMATION CHECKBOX (Hidden for absence messages) */}
          {category !== 'absence' && activeMessageType?.showConfirmation && (
            <label className="flex items-center gap-3 p-3.5 rounded-m3-2xl bg-m3-surface-container-high/60 hover:bg-m3-surface-container-high cursor-pointer transition-colors m3-pressable">
              <input
                type="checkbox"
                checked={requireConfirmation}
                onChange={(e) => setRequireConfirmation(e.target.checked)}
                className="w-4 h-4 rounded text-m3-primary focus:ring-m3-primary/50 accent-m3-primary cursor-pointer"
              />
              <span className="font-bold text-sm text-m3-on-surface">
                {t('requireConfirmationCheckbox')}
              </span>
            </label>
          )}

          {/* 7. BOTTOM ACTION BAR */}
          <div className="flex items-center justify-between gap-2 pt-3">
            <button
              type="button"
              onClick={handleBack}
              disabled={isSending || isSavingDraft}
              className="shrink-0 whitespace-nowrap px-4 py-2.5 rounded-full bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface text-xs font-bold font-display m3-pressable transition-all"
            >
              {t('cancel')}
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={
                  isSending ||
                  isSavingDraft ||
                  (category === 'absence'
                    ? (!text.trim() && selectedIds.length === 0)
                    : (!title.trim() && !text.trim() && selectedIds.length === 0))
                }
                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 rounded-full font-bold text-xs font-display transition-all ${
                  isSending ||
                  isSavingDraft ||
                  (category === 'absence'
                    ? (!text.trim() && selectedIds.length === 0)
                    : (!title.trim() && !text.trim() && selectedIds.length === 0))
                    ? 'bg-m3-surface-container-highest/60 text-m3-on-surface-variant/40 cursor-not-allowed'
                    : 'bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface m3-pressable'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>{isSavingDraft ? t('savingDraft') : t('saveAsDraft')}</span>
              </button>

              <button
                type="submit"
                disabled={
                  isSending ||
                  isSavingDraft ||
                  !recipientSummary.isValid ||
                  (category !== 'absence' && !title.trim()) ||
                  !text.trim()
                }
                className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-full font-extrabold text-xs font-display transition-all shadow-sm ${
                  isSending ||
                  isSavingDraft ||
                  !recipientSummary.isValid ||
                  (category !== 'absence' && !title.trim()) ||
                  !text.trim()
                    ? 'bg-m3-surface-container-highest text-m3-on-surface-variant/40 cursor-not-allowed'
                    : 'bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary m3-pressable shadow-m3-1'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>{isSending ? t('sending') : t('sendMessageBtn')}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* OUTAGE DRAFT POPUP MODAL */}
      {showOutageDraftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-m3-surface-container rounded-m3-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <CloudAlert className="w-7 h-7" />
              </div>
              <button
                type="button"
                onClick={() => setShowOutageDraftModal(false)}
                className="p-1 rounded-full text-m3-on-surface-variant hover:bg-m3-surface-container-high transition-colors"
                aria-label="Zavřít"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <h3 className="text-lg font-bold font-display text-m3-on-surface">
                Bakaláři mají výpadek
              </h3>
              <p className="text-sm text-m3-on-surface-variant leading-relaxed">
                Systém Bakaláři nebo server školy je momentálně nedostupný, takže zprávu se teď nepodařilo odeslat. Chcete zprávu uložit jako koncept a odeslat ji později?
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowOutageDraftModal(false)}
                className="px-4 py-2.5 rounded-full text-xs font-bold font-display text-m3-on-surface-variant hover:bg-m3-surface-container-high transition-colors m3-pressable"
              >
                Zavřít
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowOutageDraftModal(false);
                  await handleSaveDraft();
                }}
                className="px-5 py-2.5 rounded-full text-xs font-bold font-display bg-m3-primary text-m3-on-primary hover:opacity-90 transition-opacity m3-pressable shadow-xs flex items-center gap-1.5"
              >
                <FileText className="w-4 h-4" />
                <span>Uložit jako koncept</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

