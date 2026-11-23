import { describe, expect, it } from 'vitest';
import { rankEntries, searchEntry } from './recipientSearch';

const entries = [
  { label: 'Ukázka Vít RNDr.', subLabel: 'Vyučující (Příkladová úloha)' },
  { label: 'Mgr. Dana Příkladová', subLabel: 'Vyučující (Německý jazyk)' },
  { label: '9.Z Kláda Alex', subLabel: 'Student · 9.Z' },
  { label: 'Testovací Učitel', subLabel: 'Vyučující (Tělesná výchova)' },
].map((item) => searchEntry(item));

const labels = (query: string) => rankEntries(entries, query).map((i) => i.label);

describe('rankEntries', () => {
  it('keeps the order when the query is empty', () => {
    expect(labels('  ')).toEqual(entries.map(({ item }) => item.label));
  });

  it('finds names regardless of diacritics and case', () => {
    expect(labels('UKAZKA')).toEqual(['Ukázka Vít RNDr.']);
  });

  it('lists names starting with the text before names that only contain it', () => {
    expect(labels('klad').slice(0, 2)).toEqual(['9.Z Kláda Alex', 'Mgr. Dana Příkladová']);
  });

  it('puts a name match before a match in the description', () => {
    expect(labels('priklad')).toEqual(['Mgr. Dana Příkladová', 'Ukázka Vít RNDr.']);
  });

  it('requires every word and ignores their order', () => {
    expect(labels('alex klada')).toEqual(['9.Z Kláda Alex']);
    expect(labels('alex zzz')).toEqual([]);
  });

  it('matches the class of a pupil', () => {
    expect(labels('9.z')).toEqual(['9.Z Kláda Alex']);
  });
});
