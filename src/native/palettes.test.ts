import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('widget palettes', () => {
  it('android/app/src/main/assets/palettes.json matches src/index.css', () => {
    expect(() => execFileSync('node', ['scripts/export-palettes.js', '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
