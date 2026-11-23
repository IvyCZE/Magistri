import React, { useState, useMemo } from 'react';
import { Mail, User, Search, X, MessageSquare, Phone, Globe, BookMarked } from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { SubjectBadge } from '../components/common/SubjectBadge';
import { groupRadius } from '../utils/groupRadius';

export const SubjectsPage: React.FC = () => {
  const { subjectsList } = useDataStore();
  const { t, setActiveScreen } = useSettingsStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSubjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return subjectsList;
    return subjectsList.filter((s) => {
      const name = (s.name || '').toLowerCase();
      const abbrev = (s.abbrev || '').toLowerCase();
      const teacher = (s.teacherName || '').toLowerCase();
      const teacherAbbrev = (s.teacherAbbrev || '').toLowerCase();
      const email = (s.teacherEmail || '').toLowerCase();
      return (
        name.includes(q) ||
        abbrev.includes(q) ||
        teacher.includes(q) ||
        teacherAbbrev.includes(q) ||
        email.includes(q)
      );
    });
  }, [subjectsList, searchQuery]);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-5 flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-m3-on-surface">
            {t('subjectsAndTeachers')}
          </h1>
          <p className="text-xs sm:text-sm text-m3-on-surface-variant font-medium">
            {t('subjectsSubtitle')}
          </p>
        </div>

        {/* Search Bar */}
        {subjectsList.length > 4 && (
          <div className="relative min-w-[240px] sm:w-72">
            <Search className="w-4 h-4 text-m3-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchSubjectOrTeacher')}
              className="w-full pl-9 pr-8 py-2 rounded-full bg-m3-surface-container-high text-xs font-medium text-m3-on-surface placeholder:text-m3-on-surface-variant/70 border-none outline-none focus:ring-2 focus:ring-m3-primary transition-all font-display"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-m3-on-surface-variant hover:text-m3-on-surface rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredSubjects.length === 0 ? (
        <div className="p-10 rounded-m3-3xl bg-m3-surface-container flex flex-col items-center justify-center text-center gap-3 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-m3-surface-container-highest flex items-center justify-center text-m3-on-surface-variant">
            <BookMarked className="w-7 h-7" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-base font-bold font-display text-m3-on-surface">
              {searchQuery ? t('noSubjectsMatch') : t('noSubjectsFound')}
            </span>
            <span className="text-xs text-m3-on-surface-variant max-w-sm">
              {searchQuery ? t('tryDifferentSearch') : t('subjectsAutoSync')}
            </span>
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 px-4 py-2 rounded-full bg-m3-primary-container text-m3-on-primary-container text-xs font-bold font-display m3-pressable"
            >
              {t('cancelSearch')}
            </button>
          )}
        </div>
      ) : (
        /* Subjects Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {filteredSubjects.map((subj, subjIndex) => {
            const hasTeacher = Boolean(subj.teacherName && subj.teacherName !== '-');
            const hasContacts = Boolean(subj.teacherEmail || subj.teacherPhone || subj.teacherWeb);

            return (
              <div
                key={subj.id || subj.abbrev}
                className={`p-4 sm:p-5 ${groupRadius(subjIndex, filteredSubjects.length, 1, 2)} bg-m3-surface-container hover:bg-m3-surface-container-high transition-all flex flex-col justify-between gap-3.5 shadow-xs`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <SubjectBadge abbrev={subj.abbrev} name={subj.name} />

                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold font-display text-m3-on-surface truncate leading-snug">
                        {subj.name || subj.abbrev || t('subject')}
                      </h3>

                      <div className="flex items-center gap-1.5 text-xs text-m3-on-surface-variant mt-1">
                        <User className="w-3.5 h-3.5 text-m3-primary shrink-0" />
                        {hasTeacher ? (
                          <span className="font-semibold text-m3-on-surface truncate">
                            {subj.teacherName}
                            {subj.teacherAbbrev ? ` (${subj.teacherAbbrev})` : ''}
                          </span>
                        ) : (
                          <span className="text-m3-on-surface-variant italic truncate">
                            {t('teacherNotSpecified')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {hasTeacher && (
                    <button
                      type="button"
                      onClick={() => setActiveScreen('new-message')}
                      className="px-3 py-1.5 rounded-full bg-m3-surface-container-highest hover:bg-m3-primary hover:text-m3-on-primary text-xs font-bold text-m3-on-surface font-display transition-colors flex items-center gap-1.5 shrink-0 m3-pressable"
                      title={t('writeMessageInKomens')}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{t('messageButton')}</span>
                    </button>
                  )}
                </div>

                {/* Footer Contacts (classroom removed) */}
                {hasContacts && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-m3-outline/10 text-xs text-m3-on-surface-variant">
                    {subj.teacherEmail && (
                      <a
                        href={`mailto:${subj.teacherEmail}`}
                        className="flex items-center gap-1 text-m3-primary hover:underline font-medium truncate max-w-[200px]"
                        title={t('sendEmail', { email: subj.teacherEmail })}
                      >
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{subj.teacherEmail}</span>
                      </a>
                    )}

                    {subj.teacherPhone && (
                      <a
                        href={`tel:${subj.teacherPhone}`}
                        className="flex items-center gap-1 text-m3-on-surface-variant hover:text-m3-primary font-medium"
                        title={t('callPhone', { phone: subj.teacherPhone })}
                      >
                        <Phone className="w-3.5 h-3.5 text-m3-primary shrink-0" />
                        <span>{subj.teacherPhone}</span>
                      </a>
                    )}

                    {subj.teacherWeb && (
                      <a
                        href={subj.teacherWeb}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-m3-on-surface-variant hover:text-m3-primary font-medium"
                      >
                        <Globe className="w-3.5 h-3.5 text-m3-primary shrink-0" />
                        <span>Web</span>
                      </a>
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
