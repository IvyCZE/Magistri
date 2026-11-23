/** What the app can tell the user about its link to the school server. */
export type ConnectionStatus = 'ok' | 'offline' | 'outage' | 'signedOut';

export interface ConnectionFacts {
  demo: boolean;
  /** The school server refused the refresh token (for example the password was changed). */
  sessionExpired: boolean;
  /** The device reports a network connection. */
  online: boolean;
  /** The school server did not answer sensibly while the device was online. */
  serverDown: boolean;
}

/**
 * One cause is shown at a time, the one the user can act on first: a lost sign-in beats being
 * offline (which hides everything else), and being offline beats a server outage.
 */
export function deriveConnectionStatus(f: ConnectionFacts): ConnectionStatus {
  if (f.demo) return 'ok';
  if (f.sessionExpired) return 'signedOut';
  if (!f.online) return 'offline';
  if (f.serverDown) return 'outage';
  return 'ok';
}

/** Translation keys of the short label for each problem status. */
export const CONNECTION_LABEL_KEYS = {
  offline: 'statusOffline',
  outage: 'statusOutage',
  signedOut: 'statusSignedOut',
} as const;
