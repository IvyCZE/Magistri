import { describe, expect, it } from 'vitest';
import { resolveReplyRecipient } from './replyRecipient';

describe('resolveReplyRecipient', () => {
  const teachers = [{ id: 'U6KZR', name: 'Mgr. Jana Příkladová' }];
  const students = [{ id: 'Z3QKF', name: 'Tereza Příkladová, 3.A' }];

  it('uses the sender ID and role even when the directory has a different display name', () => {
    expect(resolveReplyRecipient({ id: 'U6KZR', name: 'Příkladová Jana', role: 'Vyučující' }, teachers, students))
      .toEqual({ id: 'U6KZR', type: 'U' });
    expect(resolveReplyRecipient({ id: 'Z3QKF', name: 'Tereza Příkladová', role: 'student' }, teachers, students))
      .toEqual({ id: 'Z3QKF', type: 'Z' });
  });

  it('can address a known sender before the directory loads', () => {
    expect(resolveReplyRecipient({ id: 'school-id', name: 'Jana Příkladová', role: 'Vyučující' }, [], []))
      .toEqual({ id: 'school-id', type: 'U' });
  });

  it('uses the directory role when the sender ID exists but the role is missing', () => {
    expect(resolveReplyRecipient({ id: 'Z3QKF', name: 'Tereza Příkladová' }, teachers, students))
      .toEqual({ id: 'Z3QKF', type: 'Z' });
  });

  it('matches a unique reordered full name when the sender ID is missing', () => {
    expect(resolveReplyRecipient({ id: '', name: 'Příkladová, Jana Mgr.', role: 'učitelka' }, teachers, students))
      .toEqual({ id: 'U6KZR', type: 'U' });
  });

  it('requires an explicit selection for ambiguous names or an unaddressable record', () => {
    const duplicateTeachers = [...teachers, { id: 'other-id', name: teachers[0].name }];
    const titleOnlySender = { id: '', name: teachers[0].name };
    expect(resolveReplyRecipient(titleOnlySender, duplicateTeachers, students)).toBeUndefined();
    expect(resolveReplyRecipient(titleOnlySender, [{ ...teachers[0], id: 'teacher-synthetic' }], students)).toBeUndefined();
    expect(resolveReplyRecipient({ id: 'system-id', name: 'Systém', role: 'system' }, teachers, students)).toBeUndefined();
  });
});
