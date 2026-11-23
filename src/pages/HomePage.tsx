import React from 'react';
import { useSettingsStore, WidgetKey } from '../stores/settingsStore';
import { RecentMarksWidget } from '../components/home/RecentMarksWidget';
import { HomeworkWidget } from '../components/home/HomeworkWidget';
import { MessagesWidget } from '../components/home/MessagesWidget';
import { EventsWidget } from '../components/home/EventsWidget';
import { TimetableWidget } from '../components/home/TimetableWidget';
import { CountdownWidget } from '../components/home/CountdownWidget';

import { TranslationKey } from '../i18n/translations';

const WIDGET_COMPONENTS: Record<WidgetKey, { Component: React.FC; labelKey: TranslationKey }> = {
  countdown: { Component: CountdownWidget, labelKey: 'countdownWidget' },
  recentMarks: { Component: RecentMarksWidget, labelKey: 'recentMarks' },
  timetable: { Component: TimetableWidget, labelKey: 'timetable' },
  homework: { Component: HomeworkWidget, labelKey: 'homework' },
  messages: { Component: MessagesWidget, labelKey: 'messages' },
  events: { Component: EventsWidget, labelKey: 'events' },
};

export const HomePage: React.FC = () => {
  const { widgets, widgetOrder, t } = useSettingsStore();

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-5 flex flex-col gap-6">
      {widgetOrder.map((key) => {
        if (!widgets[key]) return null;
        const item = WIDGET_COMPONENTS[key];
        if (!item) return null;
        const { Component, labelKey } = item;
        return (
          <section key={key} aria-label={t(labelKey)}>
            <Component />
          </section>
        );
      })}
    </div>
  );
};
