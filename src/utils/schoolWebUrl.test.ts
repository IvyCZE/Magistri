import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { schoolModuleUrl, schoolWebUrl } from './schoolWebUrl';

describe('schoolWebUrl', () => {
  it('takes the first known address', () => {
    expect(schoolWebUrl('https://school-a.example:8443/bakaweb/', 'https://other.example')).toBe('https://school-a.example:8443/bakaweb/');
    expect(schoolWebUrl(undefined, null, ' https://skola.example ')).toBe('https://skola.example');
  });

  it('is empty when no address is known', () => {
    expect(schoolWebUrl()).toBe('');
    expect(schoolWebUrl(undefined, '', '   ')).toBe('');
  });
});

describe('schoolModuleUrl', () => {
  const schoolWithPort = 'https://school-a.example:8443/bakaweb/';
  const schoolWithoutPort = 'https://school-b.example/bakaweb';

  it('appends each web module path to the selected school address', () => {
    expect(schoolModuleUrl(schoolWithPort, 'gdpr')).toBe('https://school-a.example:8443/bakaweb/Gdpr/Commissioner/Overview');
    expect(schoolModuleUrl(schoolWithPort, 'documents')).toBe('https://school-a.example:8443/bakaweb/next/dokumentyPrehled.aspx');
    expect(schoolModuleUrl(schoolWithPort, 'eduResources')).toBe('https://school-a.example:8443/bakaweb/next/TeachingResources.aspx');
    expect(schoolModuleUrl(schoolWithoutPort, 'questionnaires')).toBe('https://school-b.example/bakaweb/Questionnaire/Filling?mode=Ankety');
    expect(schoolModuleUrl(schoolWithoutPort, 'gdpr')).toBe('https://school-b.example/bakaweb/Gdpr/Commissioner/Overview');
  });

  it('does not double the slash, whether the address ends with one or not', () => {
    expect(schoolModuleUrl(schoolWithPort, 'gdpr')).not.toContain('bakaweb//');
    expect(schoolModuleUrl(`${schoolWithoutPort}//`, 'documents')).toBe('https://school-b.example/bakaweb/next/dokumentyPrehled.aspx');
  });

  it('falls back to the start page for an unknown module and to nothing without an address', () => {
    expect(schoolModuleUrl(schoolWithPort, 'unknown')).toBe('https://school-a.example:8443/bakaweb');
    expect(schoolModuleUrl('', 'gdpr')).toBe('');
    expect(schoolModuleUrl('  ', 'gdpr')).toBe('');
  });
});

describe('school links', () => {
  it('never fall back to the demo school address', () => {
    const files = ['components/layout/Drawer.tsx', 'App.tsx', 'pages/SettingsPage.tsx'];
    for (const file of files) {
      const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
      expect(source, file).not.toContain('gybon');
    }
  });
});
