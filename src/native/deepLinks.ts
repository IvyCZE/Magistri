import { App as CapacitorApp } from '@capacitor/app';
import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { isNativePlatform } from './platform';

// Notifications and widgets open the app with prehled://open/<screen>?id=<id>.
// Any app or web page can fire such a link, so only these screens are accepted.
const ALLOWED_SCREENS = ['home', 'marks', 'timetable', 'homework', 'messages', 'message-detail', 'events', 'settings'];
const ID_PATTERN = /^[\w.:-]{1,128}$/;
const MESSAGE_WAIT_MS = 15_000;

export interface DeepLink {
  screen: string;
  id?: string;
}

export function parseDeepLink(url: string): DeepLink | null {
  const match = /^prehled:\/\/open\/([a-z-]+)(?:\?([^#]*))?(?:#.*)?$/.exec(url.trim());
  if (!match || !ALLOWED_SCREENS.includes(match[1])) return null;
  const rawId = new URLSearchParams(match[2] ?? '').get('id');
  const id = rawId && ID_PATTERN.test(rawId) ? rawId : undefined;
  return id ? { screen: match[1], id } : { screen: match[1] };
}

let waitingForMessage: (() => void) | undefined;

function openMessage(id: string) {
  waitingForMessage?.();
  waitingForMessage = undefined;
  const { setActiveScreen } = useSettingsStore.getState();
  const show = () => {
    useDataStore.getState().setSelectedMessageId(id);
    setActiveScreen(`message-detail?id=${encodeURIComponent(id)}`);
  };
  if (useDataStore.getState().messages.some((m) => m.id === id)) {
    show();
    return;
  }
  // The detail page falls back to the first message when the id is unknown, so wait until the list has it.
  setActiveScreen('messages');
  const unsubscribe = useDataStore.subscribe((s) => {
    if (!s.messages.some((m) => m.id === id)) return;
    cancel();
    show();
  });
  const timer = setTimeout(() => cancel(), MESSAGE_WAIT_MS);
  function cancel() {
    unsubscribe();
    clearTimeout(timer);
    waitingForMessage = undefined;
  }
  waitingForMessage = cancel;
}

export function applyDeepLink(url: string) {
  const link = parseDeepLink(url);
  if (!link) return;
  if (link.screen === 'message-detail') {
    if (link.id) openMessage(link.id);
    else useSettingsStore.getState().setActiveScreen('messages');
    return;
  }
  waitingForMessage?.();
  useSettingsStore.getState().setActiveScreen(link.screen);
}

export function initDeepLinks() {
  if (!isNativePlatform()) return;
  void CapacitorApp.addListener('appUrlOpen', ({ url }) => applyDeepLink(url));
  // A tap that starts the app from scratch.
  void CapacitorApp.getLaunchUrl().then((launch) => {
    if (launch?.url) applyDeepLink(launch.url);
  });
}
