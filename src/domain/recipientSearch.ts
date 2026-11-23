// Czech name searches match regardless of diacritics and case.
export const normalizeSearch = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export interface SearchEntry<T extends { label: string; subLabel?: string }> {
  item: T;
  label: string;
  tokens: string[];
  sub: string;
}

/** Prepares the strings once, so a keystroke only compares. `extra` is searchable text that is not shown. */
export const searchEntry = <T extends { label: string; subLabel?: string }>(item: T, extra = ''): SearchEntry<T> => {
  const label = normalizeSearch(item.label);
  return { item, label, tokens: label.split(/[\s,.]+/).filter(Boolean), sub: normalizeSearch(`${item.subLabel || ''} ${extra}`) };
};

/**
 * Every word of the query has to match. Names with a word starting with the query come first,
 * then names that contain it, then entries that only match their description.
 */
export const rankEntries = <T extends { label: string; subLabel?: string }>(entries: SearchEntry<T>[], query: string): T[] => {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries.map((e) => e.item);
  const hits: { item: T; score: number; index: number }[] = [];
  entries.forEach((e, index) => {
    let score = 0;
    for (const word of words) {
      if (e.tokens.some((tok) => tok.startsWith(word))) continue;
      if (e.label.includes(word)) score = Math.max(score, 1);
      else if (e.sub.includes(word)) score = Math.max(score, 2);
      else return;
    }
    hits.push({ item: e.item, score, index });
  });
  hits.sort((a, b) => a.score - b.score || a.index - b.index);
  return hits.map((h) => h.item);
};
