import { describe, expect, it } from 'vitest';
import { deriveConnectionStatus } from './connectionStatus';

const base = { demo: false, sessionExpired: false, online: true, serverDown: false };

describe('deriveConnectionStatus', () => {
  it('is ok when nothing is wrong', () => {
    expect(deriveConnectionStatus(base)).toBe('ok');
  });

  it('reports each problem', () => {
    expect(deriveConnectionStatus({ ...base, online: false })).toBe('offline');
    expect(deriveConnectionStatus({ ...base, serverDown: true })).toBe('outage');
    expect(deriveConnectionStatus({ ...base, sessionExpired: true })).toBe('signedOut');
  });

  it('puts the lost sign-in before offline, and offline before an outage', () => {
    expect(deriveConnectionStatus({ ...base, sessionExpired: true, online: false, serverDown: true })).toBe('signedOut');
    expect(deriveConnectionStatus({ ...base, online: false, serverDown: true })).toBe('offline');
  });

  it('never reports a problem in demo mode', () => {
    expect(deriveConnectionStatus({ demo: true, sessionExpired: true, online: false, serverDown: true })).toBe('ok');
  });
});
