import React from 'react';
import { Bell } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { formatCzechDate } from '../utils/dateUtils';

export const InfochannelPage: React.FC = () => {
  const { t, language } = useSettingsStore();

  const newsItems = [
    {
      id: '1',
      title:
        language === 'en'
          ? 'Launch of the new modern portal for students and parents'
          : 'Spuštění nového moderního portálu pro studenty a rodiče',
      date: '2026-08-25',
      author: language === 'en' ? 'School Leadership' : 'Vedení školy',
      content:
        language === 'en'
          ? 'Welcome to the updated information environment. All information about marks, timetable and attendance is now at hand.'
          : 'Vítejte v inovovaném informačním prostředí. Všechny informace o prospěchu, rozvrhu a docházce máte nyní po ruce v novém rozhraní.',
    },
    {
      id: '2',
      title:
        language === 'en'
          ? 'Cambridge Exam applications (FCE / CAE)'
          : 'Informace k přihláškám na Cambridge zkoušky (FCE / CAE)',
      date: '2026-08-20',
      author: language === 'en' ? 'Foreign Language Department' : 'Předmětová komise cizích jazyků',
      content:
        language === 'en'
          ? 'Those interested in taking international language exams may register by the end of September with their English teachers.'
          : 'Zájemci o složení mezinárodních jazykových zkoušek se mohou přihlásit do konce září u svých vyučujících angličtiny.',
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-5 flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 px-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-m3-on-surface">
          {t('infochannel')}
        </h1>
        <p className="text-xs sm:text-sm text-m3-on-surface-variant font-medium">
          {t('infochannelSubtitle')}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {newsItems.map((item) => (
          <div
            key={item.id}
            className="p-5 rounded-m3-2xl bg-m3-surface-container flex flex-col gap-2.5 shadow-xs hover:bg-m3-surface-container-high transition-all"
          >
            <div className="flex items-center justify-between text-xs text-m3-primary font-bold">
              <span className="flex items-center gap-1">
                <Bell className="w-3.5 h-3.5" />
                {item.author}
              </span>
              <span className="text-m3-on-surface-variant font-bold font-display">{formatCzechDate(item.date, 'full', language)}</span>
            </div>

            <h3 className="text-base font-black font-display text-m3-on-surface">
              {item.title}
            </h3>

            <p className="text-xs sm:text-sm text-m3-on-surface-variant leading-relaxed">
              {item.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
