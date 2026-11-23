import type { SchoolInfo } from '../types/bakalari';

/**
 * The login page keeps what the user has typed in sessionStorage (so switching to a password
 * manager loses nothing) and opens on the credentials step when a school is stored there.
 * Writing the school here sends the user straight to that step after signing out.
 */
export function prepareLoginForSchool(school: SchoolInfo, storage: Pick<Storage, 'setItem' | 'removeItem'> = sessionStorage) {
  try {
    storage.setItem('login_draft_school', JSON.stringify(school));
    storage.setItem('login_draft_school_search', school.name);
    storage.setItem('login_draft_step', '3');
    storage.setItem('login_draft_is_direct', 'false');
    storage.removeItem('login_draft_username');
  } catch {
    // The login page then starts at the first step, which is only less convenient.
  }
}

/** The school the user is signed in to; the token's address wins over the saved school record. */
export function schoolForReLogin(saved: SchoolInfo | null, tokenSchoolUrl: string | undefined, normalize: (url: string) => string): SchoolInfo | null {
  const tokenUrl = tokenSchoolUrl ? normalize(tokenSchoolUrl) : '';
  if (saved && (!tokenUrl || normalize(saved.schoolUrl) === tokenUrl)) return saved;
  if (!tokenUrl) return null;
  let host = tokenUrl;
  try {
    host = new URL(tokenUrl).hostname;
  } catch {
    // Keep the raw address as the name.
  }
  return { id: `DIRECT_${host}`, name: host, schoolUrl: tokenUrl };
}

const DRAFT_KEYS = [
  'login_draft_step',
  'login_draft_username',
  'login_draft_city_search',
  'login_draft_municipality',
  'login_draft_school_search',
  'login_draft_is_direct',
  'login_draft_direct_url',
  'login_draft_school',
];

export function clearLoginDraft(storage: Pick<Storage, 'removeItem'> = sessionStorage) {
  try {
    DRAFT_KEYS.forEach((key) => storage.removeItem(key));
  } catch {
    // Nothing stored, nothing to clear.
  }
}
