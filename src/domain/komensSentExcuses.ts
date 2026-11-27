import type { KomensMessage } from '../types/bakalari';
import { recipientNameKey } from './replyRecipient';

const MAX_SEND_TIME_DIFFERENCE = 2 * 60_000;

export const isLocalSentExcuse = (message: KomensMessage) =>
  message.type === 'sent' && message.category === 'absence' && /^sent-\d+$/.test(message.id);

const bodyKey = (message: KomensMessage) => message.text.normalize().replace(/\s+/g, ' ').trim();

function sameRecipient(local: KomensMessage, server: KomensMessage): boolean {
  const localId = local.recipientIds?.[0] || local.recipients?.[0]?.id;
  const serverIds = server.recipientIds || server.recipients?.flatMap(recipient => recipient.id ? [recipient.id] : []);
  if (localId && serverIds?.length) return serverIds.length === 1 && localId === serverIds[0];

  const localName = recipientNameKey(local.recipientName || local.recipients?.[0]?.name || '');
  const serverName = recipientNameKey(server.recipientName || server.recipients?.[0]?.name || '');
  return Boolean(localName && localName === serverName);
}

export function reconcileSentExcuses(localMessages: KomensMessage[], serverMessages: KomensMessage[]): KomensMessage[] {
  const serverExcuses = serverMessages.filter(message => message.type === 'sent' &&
    (message.category === 'absence' || /^omluvenka\s*:/i.test(message.title.trim())));
  const candidates = new Map<string, KomensMessage[]>();
  const matchCounts = new Map<string, number>();

  for (const local of localMessages.filter(isLocalSentExcuse)) {
    const body = bodyKey(local);
    const time = Date.parse(local.date);
    if (!body || !Number.isFinite(time)) continue;

    const matches = serverExcuses.filter(server =>
      Math.abs(time - Date.parse(server.date)) <= MAX_SEND_TIME_DIFFERENCE &&
      body === bodyKey(server) && sameRecipient(local, server));
    candidates.set(local.id, matches);
    for (const match of matches) matchCounts.set(match.id, (matchCounts.get(match.id) ?? 0) + 1);
  }

  const replacedIds = new Set<string>();
  const localIdsByServerId = new Map<string, string>();
  for (const [localId, matches] of candidates) {
    const [match] = matches;
    if (matches.length !== 1 || matchCounts.get(match.id) !== 1) continue;
    replacedIds.add(localId);
    localIdsByServerId.set(match.id, localId);
  }

  return [
    ...localMessages.filter(message => !replacedIds.has(message.id)),
    ...serverMessages.map(message => {
      const localId = localIdsByServerId.get(message.id);
      return localId ? { ...message, localId } : message;
    }),
  ];
}
