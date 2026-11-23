import React, { useState, useMemo } from 'react';
import { Clock, AlertTriangle, ShieldCheck, CheckCircle } from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { formatCzechDate } from '../utils/dateUtils';
import { formatSubjectBadgeText } from '../components/common/SubjectBadge';
import { AbsenceRecord } from '../types/bakalari';
import { groupRadius } from '../utils/groupRadius';
import { absenceHoursLabel, excuseTarget, groupRecordsByWeek } from '../domain/absenceRecords';
import { isCoveredByExcuse, loadSentExcuses } from '../domain/sentExcuses';

/**
 * Parses date string (e.g. '2026-09-18') safely in local timezone
 * and returns Czech day abbreviation: 'Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'.
 */
function getDayAbbrev(dateStr: string): string {
  if (!dateStr) return '—';
  const match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    const d = parseInt(match[3], 10);
    const localDate = new Date(y, m, d);
    const days = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
    return days[localDate.getDay()];
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const days = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
    return days[d.getDay()];
  }
  return '—';
}

/** Share of the lessons the student attended, in percent with one decimal (100 when there were no lessons). */
function getPresencePercent(base: number, lessonsCount: number): number {
  if (lessonsCount <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((1 - base / lessonsCount) * 1000) / 10));
}

/**
 * Highlight badge style for subject percentage.
 */
function getSubjectBadgeStyle(percentage: number) {
  if (percentage === 0) {
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  }
  if (percentage < 15) {
    return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  }
  if (percentage < 25) {
    return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  }
  return 'bg-rose-500/15 text-rose-600 dark:text-rose-400';
}

/**
 * Background color for history day badge based on absence status.
 * Matches the summary tiles:
 * - Excused: green (emerald)
 * - Unsolved (zatím neomluveno) & Unexcused: red (rose)
 * - Late & Soon: yellow (amber)
 */
function getHistoryBadgeColor(type: AbsenceRecord['type']) {
  switch (type) {
    case 'Excused':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
    case 'Unsolved':
    case 'Unexcused':
      return 'bg-rose-500/15 text-rose-600 dark:text-rose-400';
    case 'Late':
    case 'Soon':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
    case 'SchoolEvent':
      return 'bg-sky-500/15 text-sky-600 dark:text-sky-400';
    case 'DistanceLearning':
      return 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400';
    default:
      return 'bg-m3-surface-container-highest text-m3-on-surface-variant';
  }
}

/**
 * Returns human-readable status description for absence history record.
 */
function getHistoryStatusLabel(rec: AbsenceRecord, t: (k: string, p?: any) => string, excuseSent = false): string {
  if (excuseSent && rec.type === 'Unsolved') return t('excuseSentShort') || 'Omluvenka odeslána';
  switch (rec.type) {
    case 'Excused':
      return t('excusedShort') || 'Omluveno';
    case 'Unexcused':
      return t('unexcusedShort') || 'Neomluveno';
    case 'Unsolved':
      return t('unsolvedAbsence') || 'Čeká na omluvení';
    case 'Late':
      return t('lateArrival') || 'Pozdní příchod';
    case 'Soon':
      return t('earlyDeparture') || 'Brzký odchod';
    case 'SchoolEvent':
      return t('schoolRepresentationItem') || 'Školní akce';
    case 'DistanceLearning':
      return t('distanceTeachingItem') || 'Distanční výuka';
    default:
      return rec.typeName || 'Absence';
  }
}

/**
 * Returns appropriate font class for subject abbreviation in 44px round circle.
 */
function getAbbrevFontClass(text: string): string {
  if (text.length <= 2) return 'text-sm font-black';
  if (text.length === 3) return 'text-xs font-black tracking-tight';
  return 'text-[10px] font-black tracking-tighter leading-none';
}

export const AbsencePage: React.FC = () => {
  const { absenceSummary, absenceRecords, subjectsList } = useDataStore();
  const { t, setActiveScreen } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<'subjects' | 'history'>('subjects');
  const [sentExcuses] = useState(loadSentExcuses);

  // Find official subject abbreviation from subjectsList, or generate clean fallback
  const getSubjectAbbrev = (name: string) => {
    const found = subjectsList.find((s) => s.name?.toLowerCase().trim() === name.toLowerCase().trim());
    if (found && found.abbrev) return found.abbrev;
    return formatSubjectBadgeText(undefined, name);
  };

  // Sort absence records by date descending (newest first)
  const sortedRecords = useMemo(() => {
    return [...absenceRecords].sort((a, b) => {
      const timeA = new Date(a.date).getTime() || 0;
      const timeB = new Date(b.date).getTime() || 0;
      return timeB - timeA || (a.hourFrom ?? 99) - (b.hourFrom ?? 99);
    });
  }, [absenceRecords]);

  const weeks = useMemo(() => groupRecordsByWeek(sortedRecords), [sortedRecords]);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-5 flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 px-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-m3-on-surface">
          {t('absence')}
        </h1>
        <p className="text-xs sm:text-sm text-m3-on-surface-variant font-medium">
          {t('absenceSubtitle')}
        </p>
      </div>

      {/* Hero Attendance Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Attendance % */}
        <div className="p-4 rounded-m3-2xl bg-m3-primary-container text-m3-on-primary-container flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider font-display">
              {t('totalAttendance')}
            </span>
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black font-display block">
              {absenceSummary.percentage}%
            </span>
            <span className="text-[10px] opacity-80">{t('highAttendance')}</span>
          </div>
        </div>

        {/* Excused Hours */}
        <div className="p-4 rounded-m3-2xl bg-m3-surface-container flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-xs font-bold uppercase tracking-wider font-display">
              {t('excused')}
            </span>
            <CheckCircle className="w-4 h-4" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black font-display text-m3-on-surface block">
              {absenceSummary.excusedHours} h
            </span>
            <span className="text-[10px] text-m3-on-surface-variant">{t('allExcused')}</span>
          </div>
        </div>

        {/* Unexcused Hours */}
        <div className="p-4 rounded-m3-2xl bg-m3-surface-container flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-rose-500">
            <span className="text-xs font-bold uppercase tracking-wider font-display">
              {t('unexcused')}
            </span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black font-display text-m3-on-surface block">
              {absenceSummary.unexcusedHours} h
            </span>
            <span className="text-[10px] text-m3-on-surface-variant">{t('zeroUnexcused')}</span>
          </div>
        </div>

        {/* Late arrivals / events */}
        <div className="p-4 rounded-m3-2xl bg-m3-surface-container flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-amber-500">
            <span className="text-xs font-bold uppercase tracking-wider font-display">
              {t('lateArrivalsCount')}
            </span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black font-display text-m3-on-surface block">
              {absenceSummary.lateArrivals}×
            </span>
            <span className="text-[10px] text-m3-on-surface-variant">{t('delays')}</span>
          </div>
        </div>
      </div>

      {/* View Toggle: Podle předmětů / Historie absence */}
      <div className="flex p-1 rounded-full bg-m3-surface-container-high w-full sm:w-auto sm:self-start sm:max-w-sm shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('subjects')}
          className={`flex-1 sm:flex-initial py-2 px-5 rounded-full text-xs sm:text-sm font-bold font-display transition-all m3-pressable ${
            activeTab === 'subjects'
              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface'
          }`}
        >
          {t('absenceBySubjects')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 sm:flex-initial py-2 px-5 rounded-full text-xs sm:text-sm font-bold font-display transition-all m3-pressable ${
            activeTab === 'history'
              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface'
          }`}
        >
          {t('absenceHistory')}
        </button>
      </div>

      {/* Tab 1: Podle předmětů */}
      {activeTab === 'subjects' && (
        <div className="flex flex-col gap-3">
          {(!absenceSummary.subjects || absenceSummary.subjects.length === 0) ? (
            <div className="p-8 rounded-m3-2xl bg-m3-surface-container text-center flex flex-col items-center justify-center gap-2 text-m3-on-surface-variant shadow-xs">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
              <p className="text-sm font-bold font-display text-m3-on-surface">
                {t('noAbsenceRecords')}
              </p>
              <p className="text-xs">
                {t('noAbsenceRecordsDesc')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {absenceSummary.subjects.map((subj, subjIndex) => {
                const abbrev = getSubjectAbbrev(subj.subjectName);
                const fontClass = getAbbrevFontClass(abbrev);
                const badgeStyle = getSubjectBadgeStyle(subj.percentage);
                const presencePercent = getPresencePercent(subj.base, subj.lessonsCount);
                const presentHours = Math.max(0, subj.lessonsCount - subj.base);

                return (
                  <div
                    key={subj.subjectName}
                    className={`p-3.5 sm:p-4 ${groupRadius(subjIndex, absenceSummary.subjects!.length, 1, 2)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex items-center gap-3.5 shadow-xs`}
                  >
                    {/* Round backdrop with subject shortcut */}
                    <div
                      className={`w-11 h-11 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center font-display shrink-0 shadow-2xs select-none ${fontClass}`}
                      title={subj.subjectName}
                    >
                      {abbrev}
                    </div>

                    {/* Two rows */}
                    <div className="min-w-0 flex-1 flex flex-col gap-2">
                      {/* Row 1: Subject name on left, highlighted % + (missed/total) on right */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm sm:text-base font-bold text-m3-on-surface font-display truncate">
                          {subj.subjectName}
                        </span>
                        <div className={`px-2.5 py-0.5 rounded-full text-xs font-display flex items-center gap-1 shrink-0 ${badgeStyle}`}>
                          <span className="font-black">{presencePercent}%</span>
                          <span className="text-[11px] opacity-80 font-medium">({presentHours}/{subj.lessonsCount}h)</span>
                        </div>
                      </div>

                      {/* Row 2: Full width monochromatic progress bar */}
                      <div className="w-full bg-m3-surface-container-highest h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-m3-primary transition-all duration-300"
                          style={{ width: `${presencePercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Historie absence */}
      {activeTab === 'history' && (
        <div className="flex flex-col gap-3">
          {sortedRecords.length === 0 ? (
            <div className="p-8 rounded-m3-2xl bg-m3-surface-container text-center flex flex-col items-center justify-center gap-2 text-m3-on-surface-variant shadow-xs">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
              <p className="text-sm font-bold font-display text-m3-on-surface">
                {t('noAbsenceRecords')}
              </p>
              <p className="text-xs">
                {t('noAbsenceRecordsDesc')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {weeks.map((week) => (
              <div key={week.start || 'undated'} className="flex flex-col gap-1.5">
              {week.start && (
                <h3 className="px-1 text-xs sm:text-sm font-bold font-display text-m3-on-surface-variant">
                  {formatCzechDate(week.start, 'short')} – {formatCzechDate(week.end, 'short')}
                </h3>
              )}
              {week.records.map((rec, recIndex) => {
                const dayAbbrev = getDayAbbrev(rec.date);
                const badgeColor = getHistoryBadgeColor(rec.type);
                const excuseSent = rec.type === 'Unsolved' && isCoveredByExcuse(rec, sentExcuses);
                const statusDesc = getHistoryStatusLabel(rec, t, excuseSent);
                const canExcuse = rec.type === 'Unsolved' && !!rec.date && !excuseSent;

                return (
                  <div
                    key={rec.id}
                    className={`p-3.5 sm:p-4 ${groupRadius(recIndex, week.records.length)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex items-center justify-between gap-3.5 shadow-xs`}
                    title={rec.note || undefined}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {/* Round backdrop with day shortcut (Pá/Po/Čt...) */}
                      <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center font-black font-display text-xs sm:text-sm shrink-0 select-none shadow-2xs ${badgeColor}`}
                      >
                        {dayAbbrev}
                      </div>

                      {/* Single row text: "5. 11.  3. - 4. h - Čeká na omluvení" */}
                      <div className="flex items-center gap-2 min-w-0 truncate">
                        <span className="text-xs sm:text-sm font-bold font-display truncate">
                          <span className="text-m3-on-surface mr-2">{formatCzechDate(rec.date, 'short')}</span>
                          <span className="text-m3-on-surface">{absenceHoursLabel(rec)} - {statusDesc}</span>
                        </span>
                        {rec.subjectAbbrev && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-m3-surface-container-highest text-m3-on-surface-variant font-display shrink-0">
                            {rec.subjectAbbrev}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Excuse button on the right, only for records that are still unsolved */}
                    {canExcuse && (
                      <button
                        type="button"
                        onClick={() => setActiveScreen(excuseTarget(rec))}
                        className="px-3 py-1.5 rounded-full bg-m3-primary-container text-m3-on-primary-container text-xs font-bold font-display active:scale-95 transition-transform shrink-0"
                      >
                        {t('excuseAbsenceButton')}
                      </button>
                    )}
                  </div>
                );
              })}
              </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
