import { describe, expect, it } from 'vitest';
import type { Mark } from '../types/bakalari';
import { applyOverride, isMarkEdited, canHaveMinus, markTextOfValue, parseMarkValue, predictorValue, simulateAverages } from './markSimulation';

const mark = (id: string, markText: string, weight: number): Mark => ({
  id,
  markText,
  weight,
  subjectId: 'S',
  subjectAbbrev: 'S',
  subjectName: 'Subject',
  caption: id,
  markDate: '2026-01-01',
});

const marks = [mark('a', '1', 10), mark('b', '3', 10)];

describe('markSimulation', () => {
  it('parses plus and minus marks and ignores non-numeric ones', () => {
    expect(parseMarkValue('2')).toBe(2);
    expect(parseMarkValue('2-')).toBe(2.5);
    expect(parseMarkValue('N')).toBeNaN();
  });

  it('changes nothing without overrides or simulated marks', () => {
    expect(simulateAverages(marks, {}, [], 0)).toEqual({ originalAvg: 2, newAvg: 2 });
  });

  it('applies an edited grade and weight', () => {
    const result = simulateAverages(marks, { b: { markText: '5', weight: 30 } }, [], 0);
    expect(result.originalAvg).toBe(2);
    expect(result.newAvg).toBe((1 * 10 + 5 * 30) / 40);
  });

  it('leaves out a removed mark and keeps the original average', () => {
    const result = simulateAverages(marks, { b: { deleted: true } }, [], 0);
    expect(result).toEqual({ originalAvg: 2, newAvg: 1 });
  });

  it('combines overrides with simulated marks', () => {
    const result = simulateAverages(marks, { a: { deleted: true } }, [{ markValue: 5, weight: 10 }], 0);
    expect(result.newAvg).toBe(4);
  });

  it('falls back to the original average when every mark is removed', () => {
    const result = simulateAverages(marks, { a: { deleted: true }, b: { deleted: true } }, [], 1.5);
    expect(result.newAvg).toBe(2);
  });

  it('knows whether a mark really differs from the original', () => {
    const m = marks[0];
    expect(isMarkEdited(m, { markText: '1', weight: 10 })).toBe(false);
    expect(isMarkEdited(m, { markText: '2' })).toBe(true);
    expect(isMarkEdited(m, { deleted: true })).toBe(false);
    expect(applyOverride(m, { weight: 4 })).toMatchObject({ markText: '1', weight: 4 });
  });

  it('turns a grade and the minus toggle into a value and its text, with no 5-', () => {
    expect(predictorValue(2, false)).toBe(2);
    expect(predictorValue(2, true)).toBe(2.5);
    expect(predictorValue(5, true)).toBe(5);
    expect(canHaveMinus(4)).toBe(true);
    expect(canHaveMinus(5)).toBe(false);
    [1, 2, 3, 4, 5].forEach((g) => {
      [false, true].forEach((m) => expect(parseMarkValue(markTextOfValue(predictorValue(g, m)))).toBe(predictorValue(g, m)));
    });
    expect(markTextOfValue(predictorValue(1, true))).toBe('1-');
    expect(markTextOfValue(predictorValue(3, false))).toBe('3');
  });

  it('averages a simulated minus grade with its half value', () => {
    // 1 and 3 with weight 10 each, plus a simulated 2- (2.5) of weight 10
    expect(simulateAverages(marks, {}, [{ markValue: 2.5, weight: 10 }], 0).newAvg).toBeCloseTo(2.1667, 4);
  });
});
