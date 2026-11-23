import { create } from 'zustand';
import { bakalariApi } from '../api/client';
import { probeInternet } from '../utils/connectivity';

interface ConnectionFacts {
  online: boolean;
  sessionExpired: boolean;
}

/** The two facts that have no store of their own; the rest is read from the data and auth stores. */
export const useConnectionFacts = create<ConnectionFacts>(() => ({
  online: typeof navigator === 'undefined' || navigator.onLine !== false,
  sessionExpired: bakalariApi.isSessionExpired(),
}));

bakalariApi.onSessionExpiredChange((sessionExpired) => useConnectionFacts.setState({ sessionExpired }));

/** Checks that the internet is really reachable and records the result. */
export async function checkInternet(): Promise<boolean> {
  const reachable = await probeInternet();
  useConnectionFacts.setState({ online: reachable });
  return reachable;
}
