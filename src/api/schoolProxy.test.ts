// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bakalariApi } from './client';

const school = { id: 'school-1', schoolUrl: 'https://custom-school.example.invalid:8443/bakaweb/', name: 'Synthetic school' };
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

beforeEach(() => {
  localStorage.clear();
  bakalariApi.setCorsProxy('');
  bakalariApi.setTokens({ accessToken: 'test-access', refreshToken: 'test-refresh', expiresIn: 3600, tokenType: 'Bearer', userId: 'fixture-user', schoolUrl: school.schoolUrl, obtainedAt: Date.now() });
});
afterEach(() => { delete (window as any).Capacitor; vi.unstubAllGlobals(); });

describe('web school-directory authorization', () => {
  it('sends the directory ID on password login, API reads and token refresh', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.startsWith('/api-sluzby/')) return json({ schools: [school] });
      if (url.endsWith('/api/login')) return json({ access_token: 'next-access', refresh_token: 'next-refresh', expires_in: 3600, token_type: 'Bearer', 'bak:UserId': 'fixture-user' });
      return json({ Subjects: [] });
    });
    await bakalariApi.getSchoolsByMunicipality('Synthetic town');
    await bakalariApi.login(school.schoolUrl, 'fixture-user', 'fixture-password');
    await bakalariApi.getMarks();
    expect(await bakalariApi.refreshToken()).toBe(true);
    const apiCalls = calls.filter((call) => call.url.startsWith('/api-proxy/'));
    expect(apiCalls).toHaveLength(3);
    for (const call of apiCalls) {
      expect(call.url).toContain('custom-school.example.invalid:8443/bakaweb/api/');
      expect((call.init?.headers as Record<string, string>)['X-Bakalari-School-Id']).toBe(school.id);
    }
    expect(calls.some((call) => call.url.startsWith('/api-school/'))).toBe(false);
  });

  it('keeps native requests direct without a directory preflight or school-ID header', async () => {
    (window as any).Capacitor = { isNativePlatform: () => true };
    const fetcher = vi.fn(async () => json({ Subjects: [] }));
    vi.stubGlobal('fetch', fetcher);
    await bakalariApi.getMarks();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://custom-school.example.invalid:8443/bakaweb/api/3/marks');
    expect((options.headers as Record<string, string>)['X-Bakalari-School-Id']).toBeUndefined();
  });
});
