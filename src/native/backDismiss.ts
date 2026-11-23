import { useEffect, useRef } from 'react';

// Stack of close handlers for open overlays (modals, sheets). The hardware
// Back button closes the topmost one before any screen navigation happens.
const handlers: Array<() => void> = [];

export const dismissTopOverlay = (): boolean => {
  const top = handlers[handlers.length - 1];
  if (!top) return false;
  top();
  return true;
};

export function useBackDismiss(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const handler = () => closeRef.current();
    handlers.push(handler);
    return () => {
      const index = handlers.lastIndexOf(handler);
      if (index !== -1) handlers.splice(index, 1);
    };
  }, [open]);
}
