import { describe, expect, it } from 'vitest';
import { groupRadius, outerCorners, responsiveGroupRadius } from './groupRadius';

describe('outerCorners', () => {
  it('makes a single card large on every corner', () => {
    expect(outerCorners(0, 1)).toEqual({ tl: true, tr: true, bl: true, br: true });
  });

  it('rounds the top of the first and the bottom of the last card in a column', () => {
    expect(outerCorners(0, 3)).toEqual({ tl: true, tr: true, bl: false, br: false });
    expect(outerCorners(1, 3)).toEqual({ tl: false, tr: false, bl: false, br: false });
    expect(outerCorners(2, 3)).toEqual({ tl: false, tr: false, bl: true, br: true });
  });

  it('handles two columns, including a short last row', () => {
    // A B
    // C D
    // E
    expect(outerCorners(0, 5, 2)).toEqual({ tl: true, tr: false, bl: false, br: false });
    expect(outerCorners(1, 5, 2)).toEqual({ tl: false, tr: true, bl: false, br: false });
    expect(outerCorners(3, 5, 2)).toEqual({ tl: false, tr: false, bl: false, br: true });
    expect(outerCorners(4, 5, 2)).toEqual({ tl: false, tr: false, bl: true, br: true });
  });

  it('puts a lone card in the first row on both top corners', () => {
    expect(outerCorners(1, 2, 3).tr).toBe(true);
  });
});

describe('groupRadius', () => {
  it('emits one class per corner', () => {
    const classes = groupRadius(0, 2).split(' ');
    expect(classes).toEqual([
      'rounded-tl-m3-2xl',
      'rounded-tr-m3-2xl',
      'rounded-bl-m3-sm',
      'rounded-br-m3-sm',
    ]);
  });

  it('adds breakpoint classes only when the column count changes', () => {
    expect(groupRadius(0, 4, 1, 1)).not.toContain('sm:');
    expect(groupRadius(1, 4, 1, 2)).toContain('sm:rounded-tr-m3-2xl');
    expect(responsiveGroupRadius(0, 4, { base: 1, sm: 2, lg: 3 })).toContain('lg:rounded-tr-m3-sm');
  });
});
