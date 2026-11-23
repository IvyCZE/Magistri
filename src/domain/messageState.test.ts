import { describe, it, expect } from 'vitest';
import { isMessageUnread } from './messageState';

describe('isMessageUnread', () => {
  it('uses the Read flag the Bakaláři API sends', () => {
    expect(isMessageUnread({ Read: false })).toBe(true);
    expect(isMessageUnread({ Read: true })).toBe(false);
    expect(isMessageUnread({ Read: 'false' })).toBe(true);
    expect(isMessageUnread({ Read: 'true' })).toBe(false);
    expect(isMessageUnread({ Read: 0 })).toBe(true);
    expect(isMessageUnread({ Read: 1 })).toBe(false);
  });

  it('prefers Read over Unread when both are present', () => {
    expect(isMessageUnread({ Read: true, Unread: true })).toBe(false);
  });

  it('falls back to Unread when there is no Read flag', () => {
    expect(isMessageUnread({ Unread: true })).toBe(true);
    expect(isMessageUnread({ Unread: false })).toBe(false);
    expect(isMessageUnread({})).toBe(false);
    expect(isMessageUnread(null)).toBe(false);
  });
});
