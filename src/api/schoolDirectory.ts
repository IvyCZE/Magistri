import type { SchoolInfo } from '../types/bakalari';

const STORAGE_KEY = 'b_school_directory_ids';
const pending = new Map<string, Promise<string>>();

const keyOf = (value: string) => {
  const url = new URL(value);
  url.protocol = 'https:';
  return url.origin + url.pathname.replace(/\/+$/, '');
};

const read = (): Record<string, string> => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
};

// Public directory metadata only. These IDs are hints, never authorization:
// the server verifies the school URL against Bakaláři's own response.
export function rememberDirectorySchools(schools: Pick<SchoolInfo, 'id' | 'schoolUrl'>[]) {
  const known = read();
  for (const school of schools) {
    if (!/^[a-z0-9_-]{1,80}$/i.test(school.id || '')) continue;
    try { known[keyOf(school.schoolUrl)] = school.id; } catch { /* Ignore invalid directory URLs. */ }
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(known).slice(-256)))); }
  catch { /* Browsers with disabled storage can still resolve the school. */ }
}

export async function schoolDirectoryHeaders(schoolUrl: string): Promise<Record<string, string>> {
  const key = keyOf(schoolUrl);
  const id = read()[key];
  if (typeof id === 'string' && /^[a-z0-9_-]{1,80}$/i.test(id)) return { 'X-Bakalari-School-Id': id };
  let lookup = pending.get(key);
  if (!lookup) {
    lookup = (async () => {
      // Direct URLs and pre-existing logins may need an initial catalog search.
      // Resolve before starting the normal school API's 12-second deadline.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      let response: Response;
      try {
        response = await fetch(`/api-school/resolve?url=${encodeURIComponent(key)}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
      } finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error('Adresu školy se nepodařilo ověřit v adresáři Bakaláři. Zkuste to prosím znovu.');
      const school = await response.json();
      if (!school || typeof school.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(school.id) || keyOf(school.schoolUrl) !== key) {
        throw new Error('Adresář Bakaláři vrátil neplatnou adresu školy.');
      }
      rememberDirectorySchools([school]);
      return school.id;
    })();
    pending.set(key, lookup);
  }
  try { return { 'X-Bakalari-School-Id': await lookup }; }
  finally { if (pending.get(key) === lookup) pending.delete(key); }
}
