// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bakalariApi, parseAttachments } from './client';
import { rememberDirectorySchools } from './schoolDirectory';

afterEach(() => vi.unstubAllGlobals());

describe('parseAttachments', () => {
  it('maps the Bakaláři Attachments array', () => {
    expect(parseAttachments([{ Id: 'A1', Name: 'zadani.pdf', Size: 1200 }])).toEqual([
      { id: 'A1', name: 'zadani.pdf', size: 1200 },
    ]);
  });

  it('accepts numeric ids and falls back to FileName', () => {
    expect(parseAttachments([{ Id: 7, FileName: 'a.docx' }])).toEqual([{ id: '7', name: 'a.docx', size: undefined }]);
  });

  it('drops entries that cannot be downloaded', () => {
    expect(parseAttachments([{ Name: 'bez-id.pdf' }, null, { Id: '' }])).toEqual([]);
  });

  it('returns an empty list for a missing or malformed field', () => {
    expect(parseAttachments(undefined)).toEqual([]);
    expect(parseAttachments('x')).toEqual([]);
  });
});

it('keeps downloadable attachments in received, noticeboard and sent messages', async () => {
  const files = {
    received: { Id: 'P1', Name: 'obrazek.png', Type: 'image/png' },
    noticeboard: { Id: 'P2', Name: 'oznameni.pdf', Type: 'application/pdf' },
    sent: { Id: 'P3', FileName: 'informace.docx' },
  };
  rememberDirectorySchools([{ id: 'test-school', schoolUrl: 'https://school.example' }]);
  bakalariApi.setTokens({
    accessToken: 'test', refreshToken: 'test', userId: 'test', schoolUrl: 'https://school.example',
    expiresIn: 3600, obtainedAt: Date.now(), tokenType: 'Bearer',
  });
  vi.stubGlobal('fetch', async (input: string) => {
    const type = input.split('/').at(-1) as keyof typeof files;
    return Response.json(type in files ? { Messages: [{ Id: type, Text: '<p style="color: teal">Text</p><img src="#">', Attachments: [files[type], { Name: 'missing-id' }] }] } : {});
  });

  const messages = await bakalariApi.getMessages();
  const firstAttachment = (type: keyof typeof files) => messages.find((message) => message.type === type)?.attachments;
  expect(firstAttachment('received')).toEqual([{ id: 'P1', name: 'obrazek.png', mimeType: 'image/png' }]);
  expect(firstAttachment('noticeboard')).toEqual([{ id: 'P2', name: 'oznameni.pdf', mimeType: 'application/pdf' }]);
  expect(firstAttachment('sent')).toEqual([{ id: 'P3', name: 'informace.docx' }]);
  for (const message of messages) {
    expect(message.needsBodyDetail).toBe(true);
    expect(message.html).toBe('<p style="color: teal;">Text</p>');
  }
});

it('loads and sanitizes the received detail by encoded message ID', async () => {
  rememberDirectorySchools([{ id: 'test-school', schoolUrl: 'https://school.example' }]);
  bakalariApi.setTokens({
    accessToken: 'test', refreshToken: 'test', userId: 'test', schoolUrl: 'https://school.example',
    expiresIn: 3600, obtainedAt: Date.now(), tokenType: 'Bearer',
  });
  const fetchDetail = vi.fn(async () => Response.json({
    Message: { Text: '<span style="color: red; position: fixed">Full detail</span>' },
  }));
  vi.stubGlobal('fetch', fetchDetail);
  await expect(bakalariApi.getKomensMessageBody('received', 'M/1')).resolves.toEqual({
    text: 'Full detail', html: '<span style="color: red;">Full detail</span>', needsBodyDetail: false,
  });
  expect(fetchDetail).toHaveBeenCalledWith(expect.stringContaining('/api/3/komens/messages/received/M%2F1'), expect.anything());
});
