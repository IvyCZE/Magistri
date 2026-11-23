import React, { useCallback, useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Bell, BatteryCharging, CheckSquare, Calendar, GraduationCap, MessageSquare, Moon } from 'lucide-react';
import { NotificationCategory, useSettingsStore } from '../../stores/settingsStore';
import {
  NotificationStatus,
  getNotificationStatus,
  openSystemSettings,
  requestNotificationPermission,
} from '../../native/bridge';
import { TranslationKey } from '../../i18n/translations';
import { groupRadius, STANDALONE_RADIUS } from '../../utils/groupRadius';

const ASKED_KEY = 'b_notif_asked';

const CATEGORIES: Array<{ key: NotificationCategory; labelKey: TranslationKey; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'marks', labelKey: 'notifyMarks', icon: GraduationCap },
  { key: 'messages', labelKey: 'notifyMessages', icon: MessageSquare },
  { key: 'timetable', labelKey: 'notifyTimetable', icon: Calendar },
  { key: 'homework', labelKey: 'notifyHomework', icon: CheckSquare },
];

const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const timeToMinutes = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const Switch: React.FC<{ on: boolean; onChange: (on: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={(e) => {
      e.stopPropagation();
      onChange(!on);
    }}
    className={`w-12 h-7 rounded-full transition-colors flex items-center p-1 shrink-0 ${
      on ? 'bg-m3-primary justify-end' : 'bg-m3-surface-container-highest justify-start'
    }`}
  >
    <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
  </button>
);

const IconBubble: React.FC<{ icon: React.ComponentType<{ className?: string }> }> = ({ icon: Icon }) => (
  <div className="w-12 h-12 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shrink-0 shadow-2xs">
    <Icon className="w-6 h-6" />
  </div>
);

const cardClass = 'p-4 sm:p-5 bg-m3-surface-container shadow-xs';
const buttonClass = 'px-4 py-2.5 rounded-full bg-m3-primary text-m3-on-primary font-bold font-display text-xs m3-pressable shrink-0';

export const NotificationSettings: React.FC = () => {
  const { t, notifications, setNotificationEnabled, nightRest, setNightRest } = useSettingsStore();
  const [status, setStatus] = useState<NotificationStatus | null>(null);

  const refresh = useCallback(() => {
    void getNotificationStatus().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
    // The user may switch notifications on in the Android settings and come back.
    const listener = CapacitorApp.addListener('resume', refresh);
    return () => {
      void listener.then((l) => l.remove());
    };
  }, [refresh]);

  const asked = localStorage.getItem(ASKED_KEY) === 'true';
  const canAsk = !!status?.runtimePermission && !asked;

  const handlePermission = async () => {
    if (canAsk) {
      localStorage.setItem(ASKED_KEY, 'true');
      setStatus(await requestNotificationPermission());
    } else {
      await openSystemSettings('notifications');
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className={`${cardClass} ${STANDALONE_RADIUS} flex items-center justify-between gap-4`}>
        <div className="flex items-center gap-3.5 min-w-0">
          <IconBubble icon={Bell} />
          <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight">{t('notificationsPermission')}</span>
        </div>
        {status?.enabled ? (
          <span className="px-3 py-1.5 rounded-full text-xs font-bold font-display shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            {t('notificationsOn')}
          </span>
        ) : (
          <button type="button" onClick={() => void handlePermission()} className={buttonClass}>
            {canAsk ? t('notificationsAllow') : t('notificationsOpenSettings')}
          </button>
        )}
      </div>

      <div className="px-1 pt-3.5 pb-1.5">
        <h3 className="text-sm font-bold font-display text-m3-on-surface">{t('notificationsCategories')}</h3>
      </div>
      {CATEGORIES.map(({ key, labelKey, icon }, categoryIndex) => (
        <div
          key={key}
          onClick={() => setNotificationEnabled(key, !notifications[key])}
          className={`${cardClass} ${groupRadius(categoryIndex, CATEGORIES.length + 2)} flex items-center justify-between gap-4 cursor-pointer select-none m3-pressable`}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <IconBubble icon={icon} />
            <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight">{t(labelKey)}</span>
          </div>
          <Switch on={notifications[key]} onChange={(on) => setNotificationEnabled(key, on)} label={t(labelKey)} />
        </div>
      ))}

      <div className={`${cardClass} ${groupRadius(CATEGORIES.length, CATEGORIES.length + 2)} flex flex-col gap-4`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <IconBubble icon={Moon} />
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight">{t('nightRest')}</span>
              <span className="text-xs text-m3-on-surface-variant mt-0.5">{t('nightRestDesc')}</span>
            </div>
          </div>
          <Switch on={nightRest.enabled} onChange={(enabled) => setNightRest({ enabled })} label={t('nightRest')} />
        </div>
        {nightRest.enabled && (
          <div className="flex items-center gap-3 flex-wrap">
            {(['start', 'end'] as const).map((field) => (
              <label key={field} className="flex items-center gap-2 text-xs font-bold font-display text-m3-on-surface-variant">
                {field === 'start' ? t('nightFrom') : t('nightTo')}
                <input
                  type="time"
                  value={minutesToTime(nightRest[field])}
                  onChange={(e) => {
                    const minutes = timeToMinutes(e.target.value);
                    if (minutes !== null) setNightRest({ [field]: minutes });
                  }}
                  className="px-3 py-2 rounded-full bg-m3-surface-container-high text-m3-on-surface text-sm font-display outline-none"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={`${cardClass} ${groupRadius(CATEGORIES.length + 1, CATEGORIES.length + 2)} flex flex-col gap-3`}>
        <div className="flex items-center gap-3.5">
          <IconBubble icon={BatteryCharging} />
          <span className="font-extrabold font-display text-base text-m3-on-surface leading-tight">{t('notificationsTimingTitle')}</span>
        </div>
        <p className="text-xs text-m3-on-surface-variant leading-relaxed">{t('notificationsTimingDesc')}</p>
        <p className="text-xs text-m3-on-surface-variant leading-relaxed">{t('notificationsBatteryHint')}</p>
        <div>
          <button type="button" onClick={() => void openSystemSettings('battery')} className={buttonClass}>
            {t('notificationsOpenBattery')}
          </button>
        </div>
      </div>
    </div>
  );
};
