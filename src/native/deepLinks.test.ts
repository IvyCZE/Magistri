// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDeepLink } from './deepLinks';

describe('parseDeepLink', () => {
  it('accepts known screens', () => {
    expect(parseDeepLink('prehled://open/marks')).toEqual({ screen: 'marks' });
    expect(parseDeepLink('prehled://open/homework')).toEqual({ screen: 'homework' });
  });

  it('reads the id for message details', () => {
    expect(parseDeepLink('prehled://open/message-detail?id=abc-123')).toEqual({ screen: 'message-detail', id: 'abc-123' });
  });

  it('drops ids with unexpected characters', () => {
    expect(parseDeepLink('prehled://open/message-detail?id=%3Cscript%3E')).toEqual({ screen: 'message-detail' });
    expect(parseDeepLink(`prehled://open/message-detail?id=${'a'.repeat(200)}`)).toEqual({ screen: 'message-detail' });
  });

  it('rejects other schemes, hosts and screens', () => {
    expect(parseDeepLink('https://open/marks')).toBeNull();
    expect(parseDeepLink('prehled://other/marks')).toBeNull();
    expect(parseDeepLink('prehled://open/login')).toBeNull();
    expect(parseDeepLink('prehled://open/new-message')).toBeNull();
    expect(parseDeepLink('prehled://open/')).toBeNull();
  });
});
