import { describe, expect, it } from 'vitest';
import { probeInternet } from './connectivity';

describe('probeInternet', () => {
  it('is reachable when any answer comes back', async () => {
    expect(await probeInternet(50, (async () => ({ type: 'opaque' })) as unknown as typeof fetch)).toBe(true);
  });

  it('is unreachable on a network failure', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await probeInternet(50, failing)).toBe(false);
  });

  it('is unreachable when nothing answers in time', async () => {
    const hanging = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    expect(await probeInternet(20, hanging)).toBe(false);
  });
});
