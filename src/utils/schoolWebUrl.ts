/**
 * Address of the school's own Bakaláři web: the first known one (saved school, then the profile). It is
 * empty when none is known, so callers hide the link instead of sending the user to someone else's school.
 */
export function schoolWebUrl(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const url = candidate?.trim();
    if (url) return url;
  }
  return '';
}

// Web module paths are relative to the school's Bakaláři address.
const MODULE_PATHS: Record<string, string> = {
  gdpr: 'Gdpr/Commissioner/Overview',
  documents: 'next/dokumentyPrehled.aspx',
  questionnaires: 'Questionnaire/Filling?mode=Ankety',
  eduResources: 'next/TeachingResources.aspx',
};

/** Page of a web module on the school's web; the school's start page for a module without a known page. */
export function schoolModuleUrl(schoolUrl: string, moduleId: string): string {
  const root = schoolUrl.trim().replace(/\/+$/, '');
  if (!root) return '';
  const page = MODULE_PATHS[moduleId];
  return page ? `${root}/${page}` : root;
}
