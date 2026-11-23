import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Search,
  X,
  RefreshCw,
  Calendar,
  User,
  FileText,
} from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { SubjectBadge } from '../components/common/SubjectBadge';
import { formatDateWithDay, getAppDate } from '../utils/dateUtils';
import { TeachingTopic } from '../types/bakalari';
import { groupRadius } from '../utils/groupRadius';

function getRelativeDateLabel(
  dateStr: string,
  appDate: Date,
  todayLabel: string,
  yesterdayLabel: string
): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;

  const targetY = d.getFullYear();
  const targetM = d.getMonth();
  const targetD = d.getDate();

  const appY = appDate.getFullYear();
  const appM = appDate.getMonth();
  const appD = appDate.getDate();

  if (targetY === appY && targetM === appM && targetD === appD) {
    return todayLabel;
  }

  const yesterday = new Date(appDate);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    targetY === yesterday.getFullYear() &&
    targetM === yesterday.getMonth() &&
    targetD === yesterday.getDate()
  ) {
    return yesterdayLabel;
  }

  return null;
}

function formatHourBadge(hour: string | undefined, hourPrefix: string): string {
  if (!hour) return '';
  const trimmed = hour.trim();
  const match = trimmed.match(/^(\d+)/);
  if (match) {
    return hourPrefix.replace('{{hour}}', match[1]);
  }
  return trimmed;
}

export const TeachingPage: React.FC = () => {
  const { teachingTopics, isTeachingLoading, fetchTeachingTopics } = useDataStore();
  const { t, language } = useSettingsStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');

  const appDate = useMemo(() => getAppDate(), []);

  // Fetch teaching topics on mount if empty
  useEffect(() => {
    fetchTeachingTopics();
  }, [fetchTeachingTopics]);

  // Extract available subjects with count
  const subjectFilters = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();

    teachingTopics.forEach((topic) => {
      const code = (topic.subjectAbbrev || topic.subjectName || t('other')).toUpperCase();
      const label = topic.subjectAbbrev || topic.subjectName || code;
      const current = counts.get(code);
      if (current) {
        current.count += 1;
      } else {
        counts.set(code, { label, count: 1 });
      }
    });

    return Array.from(counts.entries())
      .map(([code, data]) => ({
        code,
        label: data.label,
        count: data.count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, language === 'cs' ? 'cs' : 'en'));
  }, [teachingTopics, t, language]);

  // Filter topics
  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return teachingTopics.filter((topic) => {
      // Subject filter
      if (selectedSubject !== 'all') {
        const itemCode = (topic.subjectAbbrev || topic.subjectName || '').toUpperCase();
        if (itemCode !== selectedSubject) return false;
      }

      // Search query filter
      if (q) {
        const topicText = (topic.topic || '').toLowerCase();
        const noteText = (topic.note || '').toLowerCase();
        const teacherText = (topic.teacher || '').toLowerCase();
        const subjName = (topic.subjectName || '').toLowerCase();
        const subjAbbrev = (topic.subjectAbbrev || '').toLowerCase();
        const hourText = (topic.hour || '').toLowerCase();
        const dateText = (topic.date || '').toLowerCase();

        return (
          topicText.includes(q) ||
          noteText.includes(q) ||
          teacherText.includes(q) ||
          subjName.includes(q) ||
          subjAbbrev.includes(q) ||
          hourText.includes(q) ||
          dateText.includes(q)
        );
      }

      return true;
    });
  }, [teachingTopics, selectedSubject, searchQuery]);

  // Group topics by date
  const groupedTopics = useMemo(() => {
    const groups: { date: string; items: TeachingTopic[] }[] = [];
    const map = new Map<string, TeachingTopic[]>();

    filteredTopics.forEach((topic) => {
      const dateKey = topic.date || '';
      if (!map.has(dateKey)) {
        const list: TeachingTopic[] = [];
        map.set(dateKey, list);
        groups.push({ date: dateKey, items: list });
      }
      map.get(dateKey)!.push(topic);
    });

    return groups;
  }, [filteredTopics]);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-5 flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 px-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-m3-on-surface">
          {t('teachingClassbook')}
        </h1>
        <p className="text-xs sm:text-sm text-m3-on-surface-variant font-medium">
          {t('teachingSubtitle')}
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3">
        {/* Search input */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-m3-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchTeachingPlaceholder')}
            className="w-full pl-9 pr-8 py-2.5 rounded-2xl bg-m3-surface-container-high text-xs sm:text-sm font-medium text-m3-on-surface placeholder:text-m3-on-surface-variant/70 border-none outline-none focus:ring-2 focus:ring-m3-primary transition-all font-display"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-m3-on-surface-variant hover:text-m3-on-surface rounded-full"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Subject Filter Pills */}
        {subjectFilters.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            <button
              type="button"
              onClick={() => setSelectedSubject('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold font-display transition-colors whitespace-nowrap m3-pressable ${
                selectedSubject === 'all'
                  ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                  : 'bg-m3-surface-container-high text-m3-on-surface-variant hover:text-m3-on-surface'
              }`}
            >
              {t('allSubjectsFilter', { count: teachingTopics.length })}
            </button>

            {subjectFilters.map((sub) => {
              const isSelected = selectedSubject === sub.code;
              return (
                <button
                  key={sub.code}
                  type="button"
                  onClick={() => setSelectedSubject(sub.code)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold font-display transition-colors whitespace-nowrap m3-pressable flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                      : 'bg-m3-surface-container-high text-m3-on-surface-variant hover:text-m3-on-surface'
                  }`}
                >
                  <span>{sub.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected
                        ? 'bg-m3-on-primary/20 text-m3-on-primary'
                        : 'bg-m3-surface-container-highest text-m3-on-surface-variant'
                    }`}
                  >
                    {sub.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Topics Content */}
      {isTeachingLoading && teachingTopics.length === 0 ? (
        /* Loading skeleton */
        <div className="flex flex-col gap-1.5">
          {[1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className={`p-5 ${groupRadius(idx - 1, 4)} bg-m3-surface-container animate-pulse flex flex-col gap-3 shadow-xs`}
            >
              <div className="flex justify-between items-center">
                <div className="w-20 h-5 rounded-full bg-m3-surface-container-highest" />
                <div className="w-16 h-4 rounded-full bg-m3-surface-container-highest" />
              </div>
              <div className="w-3/4 h-5 rounded-lg bg-m3-surface-container-highest" />
              <div className="w-1/3 h-4 rounded-lg bg-m3-surface-container-highest" />
            </div>
          ))}
        </div>
      ) : filteredTopics.length === 0 ? (
        /* Empty State */
        <div className="p-10 rounded-m3-3xl bg-m3-surface-container flex flex-col items-center justify-center text-center gap-3 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-m3-surface-container-highest flex items-center justify-center text-m3-on-surface-variant">
            <BookOpen className="w-7 h-7" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-base font-bold font-display text-m3-on-surface">
              {searchQuery || selectedSubject !== 'all'
                ? t('noTeachingTopicsMatch')
                : t('noTeachingTopicsRecorded')}
            </span>
            <span className="text-xs text-m3-on-surface-variant max-w-sm">
              {searchQuery || selectedSubject !== 'all'
                ? t('tryAdjustFilters')
                : t('teachingAutoSync')}
            </span>
          </div>
          {searchQuery || selectedSubject !== 'all' ? (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedSubject('all');
              }}
              className="mt-2 px-4 py-2 rounded-full bg-m3-primary-container text-m3-on-primary-container text-xs font-bold font-display m3-pressable"
            >
              {t('clearFilters')}
            </button>
          ) : (
            <button
              onClick={() => fetchTeachingTopics(true)}
              disabled={isTeachingLoading}
              className="mt-2 px-4 py-2 rounded-full bg-m3-primary text-m3-on-primary text-xs font-bold font-display m3-pressable flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTeachingLoading ? 'animate-spin' : ''}`} />
              <span>{t('loadData')}</span>
            </button>
          )}
        </div>
      ) : (
        /* Grouped Topics List */
        <div className="flex flex-col gap-6">
          {groupedTopics.map((group) => {
            const relativeLabel = group.date
              ? getRelativeDateLabel(group.date, appDate, t('today'), t('yesterday'))
              : null;
            return (
              <div key={group.date || 'no-date'} className="flex flex-col gap-3">
                {/* Date Header */}
                <div className="flex items-center gap-2.5 px-1 pt-1">
                  <Calendar className="w-4 h-4 text-m3-primary shrink-0" />
                  <span className="text-sm sm:text-base font-bold font-display text-m3-on-surface">
                    {group.date ? formatDateWithDay(group.date, language) : t('noDate')}
                  </span>
                  {relativeLabel && (
                    <span className="px-2 py-0.5 rounded-full bg-m3-primary/10 text-m3-primary text-xs font-bold font-display">
                      {relativeLabel}
                    </span>
                  )}
                  <span className="text-xs text-m3-on-surface-variant font-medium ml-auto">
                    {group.items.length === 1
                      ? t('lessonsCountOne')
                      : group.items.length < 5
                      ? t('lessonsCountFew', { count: group.items.length })
                      : t('lessonsCountMany', { count: group.items.length })}
                  </span>
                </div>

                {/* Topics in this date group */}
                <div className="flex flex-col gap-1.5">
                  {group.items.map((item, itemIndex) => {
                    const hourBadge = formatHourBadge(item.hour, t('hourBadgeShort'));
                    const lessonNumber = item.lessonLabel
                      ? item.lessonLabel.startsWith('#') ||
                        item.lessonLabel.toLowerCase().includes('lekce') ||
                        item.lessonLabel.toLowerCase().includes('lesson')
                        ? item.lessonLabel
                        : t('lessonLabelPrefix', { label: item.lessonLabel })
                      : null;

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 sm:p-4 ${groupRadius(itemIndex, group.items.length)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex flex-col gap-2.5 shadow-xs`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0 w-full">
                          {/* Subject badge box on the left */}
                          <SubjectBadge abbrev={item.subjectAbbrev} name={item.subjectName} />

                          {/* Two rows vertically centered */}
                          <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
                            {/* Row 1: Topic on the left, hour on the far right */}
                            <div className="flex items-center justify-between gap-2.5 min-w-0">
                              <h3
                                className="text-sm sm:text-base font-bold font-display text-m3-on-surface truncate leading-tight"
                                title={item.topic}
                              >
                                {item.topic}
                              </h3>
                              {hourBadge && (
                                <span className="text-xs font-bold text-m3-on-surface-variant font-display shrink-0 ml-auto">
                                  {hourBadge}
                                </span>
                              )}
                            </div>

                            {/* Row 2: Teacher on the left, lesson number on the right */}
                            <div className="flex items-center justify-between gap-2 text-xs text-m3-on-surface-variant min-w-0">
                              {item.teacher ? (
                                <div className="flex items-center gap-1.5 truncate min-w-0">
                                  <User className="w-3.5 h-3.5 text-m3-primary shrink-0" />
                                  <span className="truncate">
                                    <span className="text-m3-on-surface-variant/80">
                                      {t('recordedBy')}
                                    </span>{' '}
                                    <strong className="text-m3-on-surface font-semibold">
                                      {item.teacher}
                                    </strong>
                                  </span>
                                </div>
                              ) : (
                                <span className="text-m3-on-surface-variant/70 italic text-[11px] truncate">
                                  {t('teacherNotRecorded')}
                                </span>
                              )}

                              {lessonNumber && (
                                <span className="text-[11px] font-semibold text-m3-on-surface-variant/70 font-display shrink-0 ml-auto">
                                  {lessonNumber}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Note if present */}
                        {item.note && (
                          <div className="flex items-start gap-2 p-2.5 rounded-m3-xl bg-m3-surface-container-highest/60 text-xs text-m3-on-surface-variant font-medium mt-0.5">
                            <FileText className="w-4 h-4 text-m3-primary shrink-0 mt-0.5" />
                            <span className="whitespace-pre-line leading-relaxed">{item.note}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
