// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberDirectorySchools, schoolDirectoryHeaders } from './schoolDirectory';

const school = { id: 'school-1', schoolUrl: 'https://school.example.invalid:8443/bakaweb/' };

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('public school directory hints', () => {
  it('persists selected school IDs and preserves custom domains, ports and prefixes', async () => {
    rememberDirectorySchools([school]);
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No lookup should be needed'); }));
    expect(await schoolDirectoryHeaders('https://school.example.invalid:8443/bakaweb')).toEqual({ 'X-Bakalari-School-Id': 'school-1' });
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem('b_school_directory_ids')).toContain('school-1');
  });

  it('resolves direct URLs and old saved sessions once, without sending credentials', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(school), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const headers = await Promise.all([schoolDirectoryHeaders(school.schoolUrl), schoolDirectoryHeaders(school.schoolUrl)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(headers).toEqual([{ 'X-Bakalari-School-Id': 'school-1' }, { 'X-Bakalari-School-Id': 'school-1' }]);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api-school/resolve?url=' + encodeURIComponent('https://school.example.invalid:8443/bakaweb'));
    expect(options.headers).toEqual({ Accept: 'application/json' });
    expect(options.body).toBeUndefined();
    expect(await schoolDirectoryHeaders(school.schoolUrl)).toEqual(headers[0]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a resolver response for a different domain, port or prefix', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ...school, schoolUrl: 'https://evil.invalid' }), { status: 200 }));
    await expect(schoolDirectoryHeaders(school.schoolUrl)).rejects.toThrow();
    expect(localStorage.getItem('b_school_directory_ids')).toBeNull();
  });

  it('does not persist failed lookups and lets the next attempt retry', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(schoolDirectoryHeaders(school.schoolUrl)).rejects.toThrow();
    await expect(schoolDirectoryHeaders(school.schoolUrl)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
