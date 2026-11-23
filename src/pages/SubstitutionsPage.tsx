import React from 'react';
import { ArrowRightLeft, Ban, CalendarPlus, MapPin, User, CheckCircle2, MessageSquare } from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { formatCzechDate } from '../utils/dateUtils';
import { groupRadius } from '../utils/groupRadius';

export const SubstitutionsPage: React.FC = () => {
  const { substitutions } = useDataStore();
  const { t, setActiveScreen, language } = useSettingsStore();

  const getCleanTitle = (changeType: string, description?: string) => {
    const cleanDesc = (description || '').trim();
    let typeLabel = (changeType || '').trim();
    const lower = typeLabel.toLowerCase();

    if (lower === 'roomchanged') typeLabel = t('roomChangedType');
    else if (lower === 'substitution') typeLabel = t('substitutionType');
    else if (lower === 'canceled') typeLabel = t('canceledLessonType');
    else if (lower === 'removed') typeLabel = t('removedFromTimetable');
    else if (lower === 'added') typeLabel = t('addedToTimetable');

    if (!cleanDesc) return typeLabel || t('timetableChangeDefault');
    if (cleanDesc.toLowerCase().includes(typeLabel.toLowerCase())) return cleanDesc;
    if (!typeLabel) return cleanDesc;
    return `${typeLabel}: ${cleanDesc}`;
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-5 flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 px-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-m3-on-surface">
          {t('substitutions')}
        </h1>
        <p className="text-xs sm:text-sm text-m3-on-surface-variant font-medium">
          {t('substitutionsSubtitle')}
        </p>
      </div>

      {/* Substitutions Grid */}
      {substitutions.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-center gap-2 rounded-m3-2xl bg-m3-surface-container text-m3-on-surface-variant">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          <span className="text-sm font-bold font-display text-m3-on-surface">
            {t('noSubstitutions')}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {substitutions.map((sub, subIndex) => {
            const typeLower = (sub.changeType || '').toLowerCase();
            const descLower = (sub.description || '').toLowerCase();
            const fullText = `${typeLower} ${descLower}`;

            const isCanceled =
              fullText.includes('odpad') ||
              fullText.includes('cancel') ||
              fullText.includes('vyjmut') ||
              fullText.includes('removed');
            const isAdded =
              !isCanceled &&
              (fullText.includes('přidán') ||
                fullText.includes('pridan') ||
                fullText.includes('added') ||
                fullText.includes('navíc') ||
                fullText.includes('navic'));
            const isRoom =
              !isCanceled &&
              !isAdded &&
              (fullText.includes('místnost') ||
                fullText.includes('mistnost') ||
                fullText.includes('učebn') ||
                fullText.includes('ucebn') ||
                fullText.includes('room') ||
                fullText.includes('přesun') ||
                fullText.includes('presun'));
            const isSubstituted = !isCanceled && !isAdded && !isRoom;

            const title = getCleanTitle(sub.changeType, sub.description);
            const hasSubject = Boolean(sub.subjectAbbrev && sub.subjectAbbrev !== '-');
            const hasTeacher = Boolean(
              (sub.substituteTeacher && sub.substituteTeacher !== '-') ||
              (sub.teacher && sub.teacher !== '-')
            );
            const hasDetails = Boolean(
              (sub.className && sub.className !== '-') ||
              (sub.teacher && sub.teacher !== '-') ||
              (sub.substituteTeacher && sub.substituteTeacher !== '-') ||
              (sub.room && sub.room !== '-')
            );

            return (
              <div
                key={sub.id}
                className={`p-3.5 sm:p-4 ${groupRadius(subIndex, substitutions.length, 1, 2)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex flex-col gap-2.5 shadow-xs`}
              >
                {/* Top Section: Large Icon on the left, next to it 1. hod above and change title below */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Nalevo větší ikonka */}
                    <div
                      className={`w-12 h-12 rounded-m3-xl flex items-center justify-center shrink-0 shadow-2xs ${
                        isCanceled
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          : isAdded
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : isSubstituted
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                      }`}
                      title={isCanceled ? t('canceledLessonType') : isAdded ? t('addedToTimetable') : isSubstituted ? t('substitutionType') : t('roomChangedType')}
                    >
                      {isCanceled && <Ban className="w-6 h-6" />}
                      {isAdded && <CalendarPlus className="w-6 h-6" />}
                      {isSubstituted && <ArrowRightLeft className="w-6 h-6" />}
                      {isRoom && <MapPin className="w-6 h-6" />}
                    </div>

                    {/* Vedle ní: nahoře 1. hod... a dole Suplování.../Změna místnosti... */}
                    <div className="min-w-0 flex-1">
                      {/* Nahoře to 1. hod... */}
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="font-extrabold text-m3-on-surface-variant font-display">
                          {sub.hour ? (sub.hour.includes('hod') || sub.hour.includes('lesson') ? sub.hour : t('classHourPrefix', { hour: sub.hour })) : t('defaultClassHour')}
                        </span>
                        {sub.period && (
                          <span className="font-semibold text-m3-on-surface-variant/80 font-display">
                            ({sub.period})
                          </span>
                        )}
                        {hasSubject && (
                          <span className="text-[11px] font-black font-display text-m3-on-primary-container px-2 py-0.5 rounded-md bg-m3-primary-container">
                            {sub.subjectAbbrev}
                          </span>
                        )}
                      </div>

                      {/* Dole Suplování.../Změna místnosti... */}
                      <h3 className="text-base font-bold font-display text-m3-on-surface leading-snug mt-1">
                        {title}
                      </h3>
                    </div>
                  </div>

                  {/* Vpravo: datum a případně Zpráva button */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-xs font-bold text-m3-on-surface-variant font-display">
                      {formatCzechDate(sub.date, 'short', language)}
                    </span>
                    {hasTeacher && (
                      <button
                        type="button"
                        onClick={() => setActiveScreen('new-message')}
                        className="px-2.5 py-1 rounded-full bg-m3-surface-container-highest hover:bg-m3-primary hover:text-m3-on-primary text-[11px] font-bold text-m3-on-surface font-display transition-colors flex items-center gap-1 shrink-0 m3-pressable"
                        title={t('writeMessageInKomens')}
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>{t('messageButton')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Details Footer */}
                {hasDetails && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-m3-on-surface-variant">
                    {sub.className && sub.className !== '-' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-m3-on-surface-variant">{t('classLabel')}</span>
                        <strong className="text-m3-on-surface font-semibold">{sub.className}</strong>
                      </div>
                    )}

                    {sub.teacher && sub.teacher !== '-' && (
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-m3-primary shrink-0" />
                        <span>
                          {t('originalTeacherLabel')} <strong className="text-m3-on-surface font-semibold">{sub.teacher}</strong>
                        </span>
                      </div>
                    )}

                    {sub.substituteTeacher && sub.substituteTeacher !== '-' && (
                      <div className="flex items-center gap-1.5">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>
                          {t('substituteTeacherLabel')} <strong className="text-m3-on-surface font-semibold">{sub.substituteTeacher}</strong>
                        </span>
                      </div>
                    )}

                    {sub.room && sub.room !== '-' && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                        <span>
                          {t('roomLabel')} <strong className="text-m3-on-surface font-semibold">{sub.room}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
