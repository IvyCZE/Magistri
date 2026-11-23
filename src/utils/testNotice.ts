import { useSyncExternalStore } from 'react';

const KEY = 'test_notice_dismissed';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

let dismissed = read();
const listeners = new Set<() => void>();

/** Hides the test version notice in the drawer and on the login screen for good. */
export function dismissTestNotice(): void {
  dismissed = true;
  try {
    localStorage.setItem(KEY, 'true');
  } catch {
    // The notice stays hidden until the app restarts.
  }
  listeners.forEach((listener) => listener());
}

export function useTestNoticeDismissed(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => dismissed,
    () => false,
  );
}
