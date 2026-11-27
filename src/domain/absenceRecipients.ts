import type { KomensMessageTypeInfo } from '../types/bakalari';
import { isAddressablePerson } from './replyRecipient';

export interface AbsenceRecipient {
  id: string;
  name: string;
  isDefault?: boolean;
}

export function komensAbsenceRecipients(types: readonly KomensMessageTypeInfo[]): AbsenceRecipient[] {
  const excuse = types.find(type => type.abbreviation.toUpperCase() === 'OMLUVENKA');
  const recipients = new Map<string, AbsenceRecipient>();
  for (const option of excuse?.recipientsTypes ?? []) {
    if (option.code.toUpperCase() !== 'U') continue;
    for (const person of option.recipients ?? []) {
      const id = String(person.code ?? '').trim();
      if (!isAddressablePerson(id)) continue;
      const previous = recipients.get(id);
      recipients.set(id, {
        id,
        name: person.displayName || person.name || previous?.name || '',
        isDefault: person.isDefault || previous?.isDefault,
      });
    }
  }
  return [...recipients.values()];
}

export function selectAbsenceRecipient(
  recipients: readonly AbsenceRecipient[],
  selectedId: string,
): AbsenceRecipient | undefined {
  const selected = recipients.find(recipient => recipient.id === selectedId);
  if (selected || recipients.length <= 1) return selected || recipients[0];
  const defaults = recipients.filter(recipient => recipient.isDefault);
  return defaults.length === 1 ? defaults[0] : undefined;
}
