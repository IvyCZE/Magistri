// Connected-list corner style: the corners on the outside of a group of cards
// are large, the corners where cards face each other are small. Gaps between
// the cards stay whatever the list already uses.
//
// Tailwind only generates classes it can find as whole strings, so every
// class is spelled out here instead of being built from parts.
type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Prefix = '' | 'sm:' | 'md:' | 'lg:';

const CLASSES: Record<Prefix, Record<Corner, [small: string, large: string]>> = {
  '': {
    tl: ['rounded-tl-m3-sm', 'rounded-tl-m3-2xl'],
    tr: ['rounded-tr-m3-sm', 'rounded-tr-m3-2xl'],
    bl: ['rounded-bl-m3-sm', 'rounded-bl-m3-2xl'],
    br: ['rounded-br-m3-sm', 'rounded-br-m3-2xl'],
  },
  'sm:': {
    tl: ['sm:rounded-tl-m3-sm', 'sm:rounded-tl-m3-2xl'],
    tr: ['sm:rounded-tr-m3-sm', 'sm:rounded-tr-m3-2xl'],
    bl: ['sm:rounded-bl-m3-sm', 'sm:rounded-bl-m3-2xl'],
    br: ['sm:rounded-br-m3-sm', 'sm:rounded-br-m3-2xl'],
  },
  'md:': {
    tl: ['md:rounded-tl-m3-sm', 'md:rounded-tl-m3-2xl'],
    tr: ['md:rounded-tr-m3-sm', 'md:rounded-tr-m3-2xl'],
    bl: ['md:rounded-bl-m3-sm', 'md:rounded-bl-m3-2xl'],
    br: ['md:rounded-br-m3-sm', 'md:rounded-br-m3-2xl'],
  },
  'lg:': {
    tl: ['lg:rounded-tl-m3-sm', 'lg:rounded-tl-m3-2xl'],
    tr: ['lg:rounded-tr-m3-sm', 'lg:rounded-tr-m3-2xl'],
    bl: ['lg:rounded-bl-m3-sm', 'lg:rounded-bl-m3-2xl'],
    br: ['lg:rounded-br-m3-sm', 'lg:rounded-br-m3-2xl'],
  },
};

const ORDER: Corner[] = ['tl', 'tr', 'bl', 'br'];

/** Which corners of item `index` (of `count`, laid out in `cols` columns) lie on the outside of the group. */
export const outerCorners = (index: number, count: number, cols = 1): Record<Corner, boolean> => {
  const rows = Math.ceil(count / cols);
  const row = Math.floor(index / cols);
  const col = index % cols;
  const lastRowPartial = count % cols !== 0;
  const isLast = index === count - 1;
  return {
    tl: index === 0,
    tr: row === 0 && (col === cols - 1 || isLast),
    bl: row === rows - 1 && col === 0,
    // With a short last row the item above the last column also ends the group.
    br: isLast || (lastRowPartial && row === rows - 2 && col === cols - 1),
  };
};

const classesFor = (prefix: Prefix, outer: Record<Corner, boolean>): string =>
  ORDER.map((c) => CLASSES[prefix][c][outer[c] ? 1 : 0]).join(' ');

/**
 * Corner classes for one card of a connected group.
 * `cols` is the column count; pass `wideCols` (and optionally the breakpoint) when the
 * list switches to more columns on wider screens.
 */
export const groupRadius = (
  index: number,
  count: number,
  cols = 1,
  wideCols?: number,
  wideFrom: Exclude<Prefix, ''> = 'sm:'
): string => {
  const base = classesFor('', outerCorners(index, count, cols));
  if (wideCols === undefined || wideCols === cols) return base;
  return `${base} ${classesFor(wideFrom, outerCorners(index, count, wideCols))}`;
};

/** Same, for a grid whose column count changes at several breakpoints. */
export const responsiveGroupRadius = (
  index: number,
  count: number,
  cols: { base: number; sm?: number; md?: number; lg?: number }
): string => {
  const parts = [classesFor('', outerCorners(index, count, cols.base))];
  (['sm:', 'md:', 'lg:'] as const).forEach((prefix) => {
    const n = cols[prefix.slice(0, -1) as 'sm' | 'md' | 'lg'];
    if (n !== undefined) parts.push(classesFor(prefix, outerCorners(index, count, n)));
  });
  return parts.join(' ');
};

/** A card that stands apart from its neighbours (all corners large). */
export const STANDALONE_RADIUS = 'rounded-m3-2xl';
