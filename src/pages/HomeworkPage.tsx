import React, { useState, useMemo } from 'react';
import { useBackDismiss } from '../native/backDismiss';
import {
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Plus,
  Pencil,
  Trash2,
  X,
  BookOpen,
} from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { formatCzechDate } from '../utils/dateUtils';
import { Homework } from '../types/bakalari';
import { AttachmentRow } from '../components/common/AttachmentRow';
import { homeworkStatus, homeworkWeeks, type HomeworkStatus } from '../domain/homework';
import { shiftIsoDate, toIsoDate } from '../domain/time';
import { groupRadius } from '../utils/groupRadius';

const TABS = ['active', 'overdue', 'closed'] as const;
const TAB_TEXT = {
  active: { label: 'tabActive', empty: 'noActiveHomework' },
  overdue: { label: 'tabOverdueHomework', empty: 'noOverdueHomework' },
  closed: { label: 'closedHomework', empty: 'noClosedHomework' },
} as const;

export const HomeworkPage: React.FC = () => {
  const {
    homeworks,
    subjectsMarks,
    subjectsList,
    toggleHomeworkDone,
    addCustomHomework,
    updateCustomHomework,
    deleteCustomHomework,
  } = useDataStore();
  const { t } = useSettingsStore();
  const today = toIsoDate(new Date());

  const [activeTab, setActiveTab] = useState<HomeworkStatus>('active');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  useBackDismiss(isModalOpen, () => setIsModalOpen(false));
  const [editingHomework, setEditingHomework] = useState<Homework | null>(null);

  // Form State
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>('');
  const [customSubjectAbbrev, setCustomSubjectAbbrev] = useState<string>('');
  const [customSubjectName, setCustomSubjectName] = useState<string>('');
  const [deadlineDate, setDeadlineDate] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Available subjects list from marks and school subjects
  const availableSubjects = useMemo(() => {
    const map = new Map<string, { id: string; abbrev: string; name: string }>();

    subjectsMarks.forEach((s) => {
      if (s.subjectAbbrev && !map.has(s.subjectAbbrev)) {
        map.set(s.subjectAbbrev, {
          id: s.subjectId || s.subjectAbbrev,
          abbrev: s.subjectAbbrev,
          name: s.subjectName || s.subjectAbbrev,
        });
      }
    });

    subjectsList.forEach((s) => {
      if (s.abbrev && !map.has(s.abbrev)) {
        map.set(s.abbrev, {
          id: s.id || s.abbrev,
          abbrev: s.abbrev,
          name: s.name || s.abbrev,
        });
      }
    });

    if (map.size === 0) {
      [
        { id: 'CJL', abbrev: 'ČJL', name: 'Český jazyk a literatura' },
        { id: 'MAT', abbrev: 'MAT', name: 'Matematika' },
        { id: 'ANJ', abbrev: 'ANJ', name: 'Anglický jazyk' },
        { id: 'FYZ', abbrev: 'FYZ', name: 'Fyzika' },
        { id: 'INF', abbrev: 'INF', name: 'Informatika' },
        { id: 'CHE', abbrev: 'CHE', name: 'Chemie' },
        { id: 'BIO', abbrev: 'BIO', name: 'Biologie' },
        { id: 'DEJ', abbrev: 'DEJ', name: 'Dějepis' },
        { id: 'ZSV', abbrev: 'ZSV', name: 'Základy společenských věd' },
      ].forEach((s) => map.set(s.abbrev, s));
    }

    return Array.from(map.values());
  }, [subjectsMarks, subjectsList]);

  const openAddModal = () => {
    setEditingHomework(null);
    const firstSubj = availableSubjects[0]?.abbrev || 'MAT';
    setSelectedSubjectKey(firstSubj);
    setCustomSubjectAbbrev('');
    setCustomSubjectName('');
    setDeadlineDate(shiftIsoDate(today, 1));
    setContent('');
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const openEditModal = (hw: Homework) => {
    setEditingHomework(hw);
    const match = availableSubjects.find((s) => s.abbrev === hw.subjectAbbrev);
    if (match) {
      setSelectedSubjectKey(match.abbrev);
      setCustomSubjectAbbrev('');
      setCustomSubjectName('');
    } else {
      setSelectedSubjectKey('__custom__');
      setCustomSubjectAbbrev(hw.subjectAbbrev);
      setCustomSubjectName(hw.subjectName);
    }
    setDeadlineDate(hw.deadline || today);
    setContent(hw.content || '');
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleSaveHomework = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setErrorMessage(t('fillTaskWarning'));
      return;
    }
    if (!deadlineDate) {
      setErrorMessage(t('fillDeadlineWarning'));
      return;
    }

    let subjectId = 'CUSTOM';
    let subjectAbbrev = 'HW';
    let subjectName = t('customHomework');

    if (selectedSubjectKey === '__custom__') {
      subjectAbbrev = customSubjectAbbrev.trim() || 'HW';
      subjectName = customSubjectName.trim() || subjectAbbrev;
      subjectId = subjectAbbrev;
    } else {
      const match = availableSubjects.find((s) => s.abbrev === selectedSubjectKey);
      if (match) {
        subjectId = match.id;
        subjectAbbrev = match.abbrev;
        subjectName = match.name;
      }
    }

    if (editingHomework) {
      updateCustomHomework(editingHomework.id, {
        subjectId,
        subjectAbbrev,
        subjectName,
        content: content.trim(),
        deadline: deadlineDate,
      });
    } else {
      addCustomHomework({
        subjectId,
        subjectAbbrev,
        subjectName,
        teacherName: '',
        content: content.trim(),
        date: today,
        deadline: deadlineDate,
        done: false,
      });
    }

    setIsModalOpen(false);
  };

  const handleDeleteHomework = () => {
    if (!editingHomework) return;
    deleteCustomHomework(editingHomework.id);
    setIsModalOpen(false);
  };

  const byStatus = useMemo(() => {
    const lists: Record<HomeworkStatus, Homework[]> = { active: [], overdue: [], closed: [] };
    for (const homework of homeworks) lists[homeworkStatus(homework, today)].push(homework);
    return lists;
  }, [homeworks, today]);
  const weeks = useMemo(() => homeworkWeeks(byStatus[activeTab], activeTab), [byStatus, activeTab]);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-5 flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex flex-col gap-1 px-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-m3-on-surface">
          {t('homework')}
        </h1>
        <p className="text-xs sm:text-sm text-m3-on-surface-variant font-medium">
          {t('homeworkSubtitle')}
        </p>
      </div>

      {/* Header Bar: Segmented Pill Tabs + Add Button */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center p-1 sm:p-1.5 rounded-full bg-m3-surface-container gap-0.5 sm:gap-1 min-w-0 overflow-x-auto no-scrollbar">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`px-2 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold font-display whitespace-nowrap transition-all m3-pressable flex items-center gap-1 shrink-0 ${
                activeTab === id
                  ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                  : 'text-m3-on-surface-variant hover:text-m3-on-surface'
              }`}
            >
              <span>{t(TAB_TEXT[id].label)}</span>
              {id === 'active' && byStatus.active.length > 0 && (
                <span className="px-1 sm:px-1.5 text-[10px] font-black rounded-full bg-m3-surface/30">
                  {byStatus.active.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* + Přidat Button */}
        <button
          onClick={openAddModal}
          aria-label={t('addHomework')}
          title={t('addHomework')}
          className="w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-full bg-m3-primary text-m3-on-primary text-xs sm:text-sm font-bold font-display flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xs hover:bg-m3-primary/90 transition-all m3-pressable shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('addHomework')}</span>
        </button>
      </div>

      {/* Homework Cards List */}
      <div className="flex flex-col gap-4">
        {weeks.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center gap-2 rounded-m3-2xl bg-m3-surface-container text-m3-on-surface-variant">
            <CheckCircle2 className="w-10 h-10 text-m3-on-surface-variant/40" />
            <span className="text-sm font-bold font-display text-m3-on-surface">
              {t(TAB_TEXT[activeTab].empty)}
            </span>
          </div>
        ) : (
          weeks.map((week) => (
            <section key={week.start || 'undated'} className="flex flex-col gap-1.5">
              {week.start && (
                <h3 className="px-1 text-xs sm:text-sm font-bold font-display text-m3-on-surface-variant">
                  {formatCzechDate(week.start, 'short')} – {formatCzechDate(week.end, 'short')}
                </h3>
              )}
              {week.records.map((hw, index) => (
                <div
                  key={hw.id}
                  className={`p-4 sm:p-5 ${groupRadius(index, week.records.length)} transition-all flex items-start gap-4 shadow-xs bg-m3-surface-container hover:bg-m3-surface-container-high`}
                >
                  {/* Checkbox button */}
                  {hw.closed ? (
                    <CheckCircle2 aria-hidden="true" className="mt-1 w-6 h-6 shrink-0 text-emerald-500 fill-emerald-500/20" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleHomeworkDone(hw.id)}
                      aria-pressed={hw.done}
                      className="mt-1 text-m3-primary hover:text-emerald-500 transition-colors m3-pressable shrink-0"
                      title={hw.done ? t('markAsUndone') : t('markAsDone')}
                    >
                      {hw.done ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 fill-emerald-500/20" />
                      ) : (
                        <Circle className="w-6 h-6 text-m3-outline hover:text-m3-primary" />
                      )}
                    </button>
                  )}

                  {/* Homework Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-m3-primary-container text-m3-on-primary-container font-display">
                          {hw.subjectAbbrev}
                        </span>
                        <span className="text-xs font-bold text-m3-on-surface truncate">
                          {hw.subjectName}
                        </span>
                      </div>

                      {/* Due Date */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {hw.closed && <span className="text-m3-on-surface-variant">{t('homeworkClosed')}</span>}
                        <span className="flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                          <Clock className="w-3.5 h-3.5" />
                          {hw.deadline ? t('deadlineIn', { date: formatCzechDate(hw.deadline, 'full') }) : t('noHomeworkDeadline')}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-m3-on-surface mt-2 font-medium leading-relaxed">
                      {hw.content}
                    </p>

                    {hw.attachments && hw.attachments.length > 0 ? (
                      <div className="mt-3 flex flex-col gap-2 max-w-sm">
                        {hw.attachments.map((att) => (
                          <AttachmentRow key={att.id} id={att.id} name={att.name} />
                        ))}
                      </div>
                    ) : (
                      hw.attachmentName && (
                        <div className="mt-3 p-2.5 rounded-m3-lg bg-m3-surface-container-high flex items-center gap-2 max-w-sm text-xs font-bold text-m3-primary truncate">
                          <FileText className="w-4 h-4 shrink-0" />
                          <span className="truncate">{hw.attachmentName}</span>
                        </div>
                      )
                    )}

                    {/* Footer Metadata Row */}
                    <div className="flex items-center justify-between text-[11px] text-m3-on-surface-variant mt-3 pt-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {hw.isCustom && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(hw);
                            }}
                            className="px-2 py-0.5 -ml-1 rounded-full bg-m3-primary/10 hover:bg-m3-primary/20 text-m3-primary transition-colors flex items-center gap-1 font-bold text-[11px] m3-pressable shrink-0"
                            title={t('editHomework')}
                          >
                            <Pencil className="w-3 h-3" />
                            <span>{t('editShort')}</span>
                          </button>
                        )}
                        <span className="truncate">
                          {hw.isCustom ? t('customHomework') : t('assignedBy', { name: hw.teacherName || t('teacherSingular') })}
                        </span>
                      </div>

                      <span className="shrink-0">
                        {hw.isCustom
                          ? t('addedOn', { date: formatCzechDate(hw.date, 'full') })
                          : t('assignedOn', { date: formatCzechDate(hw.date, 'full') })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </div>

      {/* Add / Edit Custom Homework Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-lg p-5 sm:p-6 rounded-m3-3xl bg-m3-surface-container text-m3-on-surface shadow-2xl z-10 flex flex-col gap-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-m3-primary" />
                <h3 className="text-lg sm:text-xl font-black font-display text-m3-on-surface">
                  {editingHomework ? t('customHomeworkEdit') : t('customHomeworkAdd')}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-m3-surface-container-high flex items-center justify-center text-m3-on-surface-variant hover:text-m3-on-surface m3-pressable"
                aria-label={t('close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-m3-xl bg-rose-500/15 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                {errorMessage}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveHomework} className="flex flex-col gap-4">
              {/* Subject Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold font-display text-m3-on-surface-variant">
                  {t('subject')}
                </label>
                <select
                  value={selectedSubjectKey}
                  onChange={(e) => setSelectedSubjectKey(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-m3-xl bg-m3-surface-container-high text-m3-on-surface font-semibold text-xs sm:text-sm focus:outline-none focus:bg-m3-surface-container-highest transition-colors"
                >
                  {availableSubjects.map((s) => (
                    <option key={s.abbrev} value={s.abbrev}>
                      {s.abbrev} – {s.name}
                    </option>
                  ))}
                  <option value="__custom__">{t('customSubjectOption')}</option>
                </select>
              </div>

              {/* Custom Subject Inputs if selected */}
              {selectedSubjectKey === '__custom__' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-m3-2xl bg-m3-surface-container-high/60">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-m3-on-surface-variant">
                      {t('subjectAbbrevLabel')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('subjectAbbrevPlaceholder')}
                      value={customSubjectAbbrev}
                      onChange={(e) => setCustomSubjectAbbrev(e.target.value)}
                      className="px-3 py-2 rounded-m3-lg bg-m3-surface-container-highest text-m3-on-surface font-medium text-xs focus:outline-none transition-colors"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-m3-on-surface-variant">
                      {t('subjectFullNameLabel')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('subjectFullNamePlaceholder')}
                      value={customSubjectName}
                      onChange={(e) => setCustomSubjectName(e.target.value)}
                      className="px-3 py-2 rounded-m3-lg bg-m3-surface-container-highest text-m3-on-surface font-medium text-xs focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Due Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold font-display text-m3-on-surface-variant">
                  {t('dueDate')}
                </label>
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-m3-xl bg-m3-surface-container-high text-m3-on-surface font-semibold text-xs sm:text-sm focus:outline-none focus:bg-m3-surface-container-highest transition-colors"
                />
              </div>

              {/* Description / Content */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold font-display text-m3-on-surface-variant">
                  {t('homeworkContent')}
                </label>
                <textarea
                  rows={3}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t('homeworkContentPlaceholder')}
                  className="w-full px-3.5 py-2.5 rounded-m3-xl bg-m3-surface-container-high text-m3-on-surface font-medium text-xs sm:text-sm focus:outline-none focus:bg-m3-surface-container-highest transition-colors resize-none"
                />
              </div>

              {/* Modal Footer Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-2 mt-1">
                {editingHomework ? (
                  <button
                    type="button"
                    onClick={handleDeleteHomework}
                    className="px-3.5 py-2 rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 font-bold font-display text-xs flex items-center gap-1.5 transition-colors m3-pressable"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('deleteHomework')}</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-full bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface-variant font-bold font-display text-xs transition-colors m3-pressable"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-bold font-display text-xs transition-all shadow-xs m3-pressable"
                  >
                    {editingHomework ? t('save') : t('addHomework')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
