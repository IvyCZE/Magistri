// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { KomensMessage } from '../types/bakalari';
import { reconcileSentExcuses } from '../domain/komensSentExcuses';
import { formatCzechDate, formatMessageDate } from '../utils/dateUtils';

const sentAt = '2026-11-27T00:15:04+01:00';
const local = {
  id: 'sent-123',
  type: 'sent',
  category: 'absence',
  title: 'Omluvení absence',
  text: 'Prosím o omluvení absence.',
  recipientIds: ['U1'],
  recipientName: 'Nováková Jana Mgr.',
  sender: { id: 'me', name: 'Já' },
  date: '2026-11-26T23:15:04.500Z',
  unread: false,
  confirmed: false,
} satisfies KomensMessage;

const server: KomensMessage = {
  ...local,
  id: 'K1',
  category: undefined,
  title: 'omluvenka: Žák Test, 4.C',
  recipientIds: undefined,
  recipientName: 'Mgr. Jana Nováková',
  date: sentAt,
  confirmed: true,
};

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('replaces the local card after one send and keeps the opened detail on the server record', async () => {
  const { bakalariApi } = await import('../api/client');
  const { rememberDirectorySchools } = await import('../api/schoolDirectory');
  const { useDataStore } = await import('./dataStore');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(local.date));
  rememberDirectorySchools([{ id: 'fixture-school', schoolUrl: 'https://school.example' }]);
  bakalariApi.setTokens({
    accessToken: 'test', refreshToken: 'test', expiresIn: 3600, tokenType: 'Bearer',
    userId: 'U1', schoolUrl: 'https://school.example', obtainedAt: Date.now(),
  });
  let sentCount = 0;
  vi.stubGlobal('fetch', async (input: string, options?: RequestInit) => {
    const url = String(input).split('?')[0];
    if (url.endsWith('/api/3/komens/message') && options?.method === 'POST') {
      sentCount++;
      return new Response(null, { status: 204 });
    }
    if (url.endsWith('/api/3/komens/messages/sent')) {
      return Response.json({ Messages: [{
        Id: server.id, Type: 'Apology', Title: server.title, Text: server.text,
        RelevantName: server.recipientName, SentDate: sentAt, Confirmed: true,
      }] });
    }
    return Response.json({});
  });

  expect(await useDataStore.getState().sendMessage({
    ...local, recipientTypeCode: 'U', messageType: 'OMLUVENKA',
  })).toBe(true);
  const [pending] = useDataStore.getState().messages;
  useDataStore.getState().setSelectedMessageId(pending.id);
  await useDataStore.getState().fetchAllData();

  expect(sentCount).toBe(1);
  expect(useDataStore.getState().messages).toEqual([
    expect.objectContaining({ id: server.id, localId: pending.id, confirmed: true, date: sentAt, category: 'absence' }),
  ]);
});

it('reconciles legacy caches at startup and still shows a local excuse awaiting sync', async () => {
  const pending = { ...local, id: 'sent-456', text: 'Další omluvenka.' };
  const draft = { ...local, id: 'draft-123', type: 'draft' };
  localStorage.setItem('b_custom_messages', JSON.stringify([local, pending, draft]));
  localStorage.setItem('b_cache_messages', JSON.stringify([server]));
  const { useDataStore } = await import('./dataStore');

  expect(useDataStore.getState().messages).toEqual([
    expect.objectContaining({ id: pending.id }),
    expect.objectContaining({ id: draft.id }),
    expect.objectContaining({ id: server.id, localId: local.id, confirmed: true }),
  ]);
});

it('preserves unrelated and ambiguous excuses, including same-subject records', () => {
  const unrelated = [
    { ...server, text: 'Jiný text.' },
    { ...server, recipientName: 'Mgr. Josef Novák' },
    { ...server, date: '2026-11-27T00:25:04+01:00' },
    { ...server, recipientIds: ['U2'] },
    { ...server, title: local.title },
  ];
  for (const other of unrelated) expect(reconcileSentExcuses([local], [other])).toEqual([local, other]);
  const otherServer = { ...server, id: 'K2' };
  const otherLocal = { ...local, id: 'sent-456' };
  expect(reconcileSentExcuses([local], [server, otherServer])).toEqual([local, server, otherServer]);
  expect(reconcileSentExcuses([local, otherLocal], [server])).toEqual([local, otherLocal, server]);
});

it.each(['2026-11-27T00:15:04+01:00', '2026-06-17T00:15:04+02:00'])('formats the same instant consistently for %s', timestamp => {
  const instant = new Date(timestamp);
  for (const format of ['withTime', 'short'] as const) {
    expect(formatMessageDate(timestamp, format)).toBe(formatCzechDate(instant, format));
    expect(formatMessageDate(instant.toISOString(), format)).toBe(formatCzechDate(instant, format));
  }
  expect(formatMessageDate('2026-11-27T00:15:04', 'withTime')).toBe('27. 11. 2026 00:15');
});
