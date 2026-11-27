import type { KomensSender, StudentItem, TeacherItem } from '../types/bakalari';

export type IndividualRecipientType = 'U' | 'Z';

export function isAddressablePerson(id: string): boolean {
  return typeof id === 'string' && Boolean(id.trim()) && !/^(?:teacher-|student-|custom:|me$)/i.test(id.trim());
}

export function senderRecipientType(role?: string): IndividualRecipientType | undefined {
  if (/^\s*(?:žák|zak|student|pupil|spolužák|spoluzak)/i.test(role || '')) return 'Z';
  if (/^\s*(?:vyučující|vyucujici|učitel|ucitel|teacher|employee|třídní učitel)/i.test(role || '')) return 'U';
  return undefined;
}

export const recipientNameKey = (name: string) => name.normalize().toLowerCase().split(/[\s,]+/).filter(Boolean).sort().join(' ');

export function resolveReplyRecipient(
  sender: KomensSender,
  teachers: readonly TeacherItem[],
  students: readonly StudentItem[],
): { id: string; type: IndividualRecipientType } | undefined {
  const id = String(sender.id ?? '').trim();
  const senderType = senderRecipientType(sender.role);
  if (isAddressablePerson(id)) {
    if (senderType) return { id, type: senderType };
    const teacher = teachers.some(person => person.id === id);
    const student = students.some(person => person.id === id);
    return teacher !== student ? { id, type: teacher ? 'U' : 'Z' } : undefined;
  }

  const name = recipientNameKey(sender.name);
  if (!name) return undefined;
  const matches = new Map<string, { id: string; type: IndividualRecipientType }>();
  const collect = (people: readonly (TeacherItem | StudentItem)[], type: IndividualRecipientType) => {
    if (senderType && senderType !== type) return;
    for (const person of people) {
      if (isAddressablePerson(person.id) && recipientNameKey(person.name) === name) {
        matches.set(`${type}:${person.id}`, { id: person.id, type });
      }
    }
  };
  collect(teachers, 'U');
  collect(students, 'Z');
  return matches.size === 1 ? matches.values().next().value : undefined;
}
