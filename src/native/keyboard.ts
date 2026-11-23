import { useSyncExternalStore } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import { isNativePlatform } from './platform';

// On Android the WebView shrinks when the keyboard opens (system bars plugin
// pads the window), so fixed bars would sit on top of the keyboard and eat the
// little space left. Components read this flag to get out of the way.
let keyboardOpen = false;
const listeners = new Set<() => void>();

function setKeyboardOpen(open: boolean) {
  if (keyboardOpen === open) return;
  keyboardOpen = open;
  document.documentElement.toggleAttribute('data-keyboard-open', open);
  listeners.forEach((listener) => listener());
}

function revealFocusedField() {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

export function initKeyboard() {
  if (!isNativePlatform()) return;

  Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true)).catch(() => {});
  Keyboard.addListener('keyboardDidShow', () => {
    setKeyboardOpen(true);
    revealFocusedField();
  }).catch(() => {});
  Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false)).catch(() => {});
  Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false)).catch(() => {});
}

export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => keyboardOpen,
    () => false,
  );
}
