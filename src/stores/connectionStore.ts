import { deriveConnectionStatus, type ConnectionStatus } from '../domain/connectionStatus';
import { useAuthStore } from './authStore';
import { useDataStore } from './dataStore';
import { checkInternet, useConnectionFacts } from './connectionFacts';

export { useConnectionFacts };

const RECHECK_MS = 8000;
let recheckTimer: ReturnType<typeof setInterval> | undefined;

function refreshIfSignedIn() {
  const { isAuthenticated, isMockMode } = useAuthStore.getState();
  if (isAuthenticated && !isMockMode) void useDataStore.getState().fetchAllData(false);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useConnectionFacts.setState({ online: true });
    // What failed while offline would otherwise stay stale until the next manual refresh.
    refreshIfSignedIn();
  });
  window.addEventListener('offline', () => useConnectionFacts.setState({ online: false }));

  // The browser does not always say when the connection is back, so while offline we look for ourselves.
  useConnectionFacts.subscribe((facts, prev) => {
    if (facts.online === prev.online) return;
    clearInterval(recheckTimer);
    if (facts.online) return;
    recheckTimer = setInterval(() => {
      void checkInternet().then((reachable) => {
        if (reachable) refreshIfSignedIn();
      });
    }, RECHECK_MS);
  });
}

export function useConnectionStatus(): ConnectionStatus {
  const { online, sessionExpired } = useConnectionFacts();
  const serverDown = useDataStore((s) => s.isServerDown);
  const demo = useAuthStore((s) => s.isMockMode);
  return deriveConnectionStatus({ demo, sessionExpired, online, serverDown });
}
