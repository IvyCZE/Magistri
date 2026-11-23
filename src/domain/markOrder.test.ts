import { describe, expect, it } from 'vitest';
import { newestMarksFirst } from './markOrder';

const mark = (id: string, markDate: string) => ({ id, markDate });

describe('newestMarksFirst', () => {
  it('puts the newest date first', () => {
    const list = [mark('a', '2026-09-03'), mark('b', '2026-11-02'), mark('c', '2026-10-15')];
    expect(newestMarksFirst(list).map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('puts the later entry of the answer first on the same day', () => {
    const list = [mark('a', '2026-10-15'), mark('b', '2026-10-15'), mark('c', '2026-09-01')];
    expect(newestMarksFirst(list).map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not change the list it is given', () => {
    const list = [mark('a', '2026-09-03'), mark('b', '2026-11-02')];
    newestMarksFirst(list);
    expect(list.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('handles an empty list', () => {
    expect(newestMarksFirst([])).toEqual([]);
  });
});
