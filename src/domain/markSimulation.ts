import type { Mark } from '../types/bakalari';

/** A what-if change to a mark the school already recorded. Never sent anywhere. */
export interface MarkOverride {
  markText?: string;
  weight?: number;
  deleted?: boolean;
}

export interface SimulatedGrade {
  markValue: number;
  weight: number;
}

/** Numeric value of a mark text ("2", "2-", "1+"), or NaN when it does not count (N, points, ...). */
export const parseMarkValue = (markText: string): number =>
  parseFloat(markText.replace('-', '.5').replace('+', '.25'));

/** There is no 5-, so the minus toggle of the predictor only applies to 1 to 4. */
export const canHaveMinus = (grade: number): boolean => grade < 5;

/** Value of a predictor choice; a minus counts as .5, like `parseMarkValue` does for recorded marks. */
export const predictorValue = (grade: number, minus: boolean): number =>
  grade + (minus && canHaveMinus(grade) ? 0.5 : 0);

/** Text of a simulated grade value: 2 -> "2", 2.5 -> "2-". */
export const markTextOfValue = (value: number): string =>
  Number.isInteger(value) ? String(value) : value % 1 === 0.5 ? `${Math.floor(value)}-` : String(value);

export const isMarkEdited = (mark: Mark, override?: MarkOverride): boolean =>
  !!override && !override.deleted &&
  ((override.markText !== undefined && override.markText !== mark.markText) ||
    (override.weight !== undefined && override.weight !== mark.weight));

/** The mark as the simulation sees it (override applied). */
export const applyOverride = (mark: Mark, override?: MarkOverride): Mark =>
  override && !override.deleted
    ? {
        ...mark,
        markText: override.markText ?? mark.markText,
        weight: override.weight ?? mark.weight,
      }
    : mark;

const weightedAverage = (items: Array<{ value: number; weight: number }>): number | null => {
  let sum = 0;
  let total = 0;
  items.forEach(({ value, weight }) => {
    if (!isNaN(value)) {
      sum += value * weight;
      total += weight;
    }
  });
  return total > 0 ? sum / total : null;
};

/**
 * Average of the recorded marks as they are, and the average after the user's
 * edits, removals and simulated marks.
 */
export const simulateAverages = (
  marks: Mark[],
  overrides: Record<string, MarkOverride>,
  simulated: SimulatedGrade[],
  fallbackAverage: number
): { originalAvg: number; newAvg: number } => {
  const original = weightedAverage(
    marks.map((m) => ({ value: parseMarkValue(m.markText), weight: m.weight || 1 }))
  );
  const originalAvg = original ?? (fallbackAverage || 1.0);

  const items = marks
    .filter((m) => !overrides[m.id]?.deleted)
    .map((m) => applyOverride(m, overrides[m.id]))
    .map((m) => ({ value: parseMarkValue(m.markText), weight: m.weight || 1 }));
  simulated.forEach((s) => items.push({ value: s.markValue, weight: s.weight }));

  const next = weightedAverage(items);
  return { originalAvg, newAvg: next ?? originalAvg };
};
