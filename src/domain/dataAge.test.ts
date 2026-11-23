import { describe, expect, it } from 'vitest';
import { formatDataAge } from './dataAge';

const NOW = 1_000_000_000_000;
const min = (n: number) => n * 60 * 1000;

describe('formatDataAge', () => {
  it('is empty while the data is fresh', () => {
    expect(formatDataAge(NOW - min(1), NOW)).toBe('');
    expect(formatDataAge(NOW - min(16), NOW)).toBe('');
  });

  it('shows minutes after 16 minutes', () => {
    expect(formatDataAge(NOW - min(16) - 1000, NOW)).toBe('16min');
    expect(formatDataAge(NOW - min(17), NOW)).toBe('17min');
    expect(formatDataAge(NOW - min(59), NOW)).toBe('59min');
  });

  it('shows hours and days, rounded down', () => {
    expect(formatDataAge(NOW - min(60), NOW)).toBe('1h');
    expect(formatDataAge(NOW - min(150), NOW)).toBe('2h');
    expect(formatDataAge(NOW - min(23 * 60 + 59), NOW)).toBe('23h');
    expect(formatDataAge(NOW - min(24 * 60), NOW)).toBe('1d');
    expect(formatDataAge(NOW - min(3 * 24 * 60 + 500), NOW)).toBe('3d');
  });

  it('is empty without a refresh or with a time in the future', () => {
    expect(formatDataAge(0, NOW)).toBe('');
    expect(formatDataAge(NOW + min(5), NOW)).toBe('');
  });
});
