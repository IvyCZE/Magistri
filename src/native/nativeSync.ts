import { App as CapacitorApp } from '@capacitor/app';
import { bakalariApi } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { getHomeworkDoneOverrides, useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { setNativeLocalData, setNativePreferences, syncNativeNow } from './bridge';
import { isNativePlatform } from './platform';

const PUSH_DEBOUNCE_MS = 400;
// The web app has just downloaded the same data, so a second download right
// behind it would only load the school server for nothing.
const MIN_SYNC_GAP_MS = 2 * 60 * 1000;

let lastSyncAt = 0;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let lastDoneJson = '';

function pushPreferences() {
  const s = useSettingsStore.getState();
  return setNativePreferences({
    language: s.language === 'en' ? 'en' : 'cs',
    countdownMode: s.countdownMode,
    countdownHideDecimals: s.countdownHideDecimals,
    demo: useAuthStore.getState().isMockMode,
    notifyMarks: s.notifications.marks,
    notifyMessages: s.notifications.messages,
    notifyTimetable: s.notifications.timetable,
    notifyHomework: s.notifications.homework,
    nightRestEnabled: s.nightRest.enabled,
    nightStartMinutes: s.nightRest.start,
    nightEndMinutes: s.nightRest.end,
    accent: s.accentColor,
    themeMode: s.themeMode,
    amoled: s.amoled,
  });
}

function pushLocalData() {
  const { customHomeworks, testMarks } = useDataStore.getState();
  lastDoneJson = JSON.stringify(getHomeworkDoneOverrides());
  return setNativeLocalData({
    customHomework: customHomeworks.map((h) => ({
      id: h.id,
      subjectAbbrev: h.subjectAbbrev,
      subjectName: h.subjectName,
      content: h.content,
      date: h.date,
      deadline: h.deadline,
      done: h.done,
    })),
    homeworkDone: getHomeworkDoneOverrides(),
    testMarks: testMarks.map((m) => ({ date: m.date, hourId: Number(m.hourId), description: m.description || '' })),
  });
}

async function syncIfDue(force = false) {
  const now = Date.now();
  if (!force && now - lastSyncAt < MIN_SYNC_GAP_MS) return;
  lastSyncAt = now;
  // The background sync may be the first to learn that the school refused the sign-in.
  if ((await syncNativeNow()) === 'expired') bakalariApi.setSessionExpired(true);
}

let syncAfterPush = false;

function schedulePush(syncAfter = true) {
  syncAfterPush ||= syncAfter;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const sync = syncAfterPush;
    syncAfterPush = false;
    void Promise.all([pushPreferences(), pushLocalData()]).then(() => (sync ? syncIfDue(true) : undefined));
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Keeps the native side (widgets, background sync) informed: pushes settings and
 * web-only data when they change, and asks for a sync on start, resume and after
 * each data refresh. Does nothing in a browser.
 */
export function initNativeSync() {
  if (!isNativePlatform()) return;

  void Promise.all([pushPreferences(), pushLocalData()]).then(() => syncIfDue(true));

  // Widgets and notifications read these from native storage at render time, so no download is needed.
  useSettingsStore.subscribe((s, prev) => {
    if (
      s.language !== prev.language ||
      s.countdownMode !== prev.countdownMode ||
      s.countdownHideDecimals !== prev.countdownHideDecimals ||
      s.accentColor !== prev.accentColor ||
      s.themeMode !== prev.themeMode ||
      s.amoled !== prev.amoled ||
      s.notifications !== prev.notifications ||
      s.nightRest !== prev.nightRest
    ) {
      schedulePush(false);
    }
  });
  useAuthStore.subscribe((s, prev) => {
    if (s.isMockMode !== prev.isMockMode) schedulePush();
  });
  useDataStore.subscribe((s, prev) => {
    // The homework list is replaced on every download, so only react to ticks.
    // Test marks only change what the widgets draw, so they need a push but no download.
    if (s.testMarks !== prev.testMarks) schedulePush(false);
    if (s.customHomeworks !== prev.customHomeworks || JSON.stringify(getHomeworkDoneOverrides()) !== lastDoneJson) schedulePush();
    else if (s.lastUpdated !== prev.lastUpdated) void syncIfDue();
  });

  void CapacitorApp.addListener('resume', () => void syncIfDue());
}
