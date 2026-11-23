import { describe, expect, it } from 'vitest';
import { prepareLoginForSchool, schoolForReLogin } from './loginDraft';

const normalize = (u: string) => u.trim().replace(/\/+$/, '');
const saved = { id: 'SCHOOL_1', name: 'Ukázková škola', schoolUrl: 'https://school-a.example/bakaweb' };

describe('prepareLoginForSchool', () => {
  it('stores the school and the credentials step for the login page', () => {
    const data = new Map<string, string>();
    prepareLoginForSchool(saved, { setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) });
    expect(JSON.parse(data.get('login_draft_school')!)).toEqual(saved);
    expect(data.get('login_draft_step')).toBe('3');
    expect(data.has('login_draft_username')).toBe(false);
  });
});

describe('schoolForReLogin', () => {
  it('uses the saved school when it matches the token address', () => {
    expect(schoolForReLogin(saved, 'https://school-a.example/bakaweb/', normalize)).toBe(saved);
  });

  it('builds a school from the token address when the saved one is another school', () => {
    expect(schoolForReLogin(saved, 'https://school-b.example', normalize)).toEqual({
      id: 'DIRECT_school-b.example',
      name: 'school-b.example',
      schoolUrl: 'https://school-b.example',
    });
  });

  it('falls back to the saved school without a token, and to nothing without either', () => {
    expect(schoolForReLogin(saved, undefined, normalize)).toBe(saved);
    expect(schoolForReLogin(null, undefined, normalize)).toBeNull();
  });
});
