// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bakalariApi } from './client';
import { rememberDirectorySchools } from './schoolDirectory';
import { selectAbsenceRecipient } from '../domain/absenceRecipients';

beforeEach(() => {
  rememberDirectorySchools([{ id: 'test-school', schoolUrl: 'https://school.example' }]);
  bakalariApi.setTokens({
    accessToken: 'test', refreshToken: 'test', userId: 'test', schoolUrl: 'https://school.example',
    expiresIn: 3600, obtainedAt: Date.now(), tokenType: 'Bearer',
  });
});

afterEach(() => vi.unstubAllGlobals());

const ordinaryType = { Abbreviation: 'OBECNA', RecipientsTypes: [{ Code: 'U', Recipients: [{ Code: 'UNRELATED', Name: 'Subject teacher' }] }] };
const excuseType = { Abbreviation: 'OMLUVENKA', RecipientsTypes: [{ Code: 'U', Recipients: [] }] };

describe('absence excuse recipients', () => {
  it('uses the current Komens recipients and an explicit server default', async () => {
    const request = vi.fn(async () => Response.json({
      MessageTypes: [ordinaryType, { Abbreviation: 'OMLUVENKA', RecipientsTypes: [
        { Code: 'US', Recipients: [{ Code: 'GROUP', Name: 'Group' }] },
        { Code: 'U', Recipients: [
          { Code: 'T1', DisplayName: 'Teacher One', IsDefault: 'false' },
          { Code: 'T2', DisplayName: 'Teacher Two', IsDefault: true },
          { DisplayName: 'Unresolved name' },
        ] },
      ] }],
    }));
    vi.stubGlobal('fetch', request);
    const recipients = await bakalariApi.getAbsenceExcuseRecipients();
    expect(recipients.map(recipient => recipient.id)).toEqual(['T1', 'T2']);
    expect(selectAbsenceRecipient(recipients, '')?.id).toBe('T2');
    expect(selectAbsenceRecipient(recipients, 'T1')?.id).toBe('T1');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('requires a choice when multiple recipients have no unique default', () => {
    const recipients = [{ id: 'T1', name: 'One' }, { id: 'T2', name: 'Two' }];
    expect(selectAbsenceRecipient(recipients, 'OBSOLETE')).toBeUndefined();
    expect(selectAbsenceRecipient(recipients.map(r => ({ ...r, isDefault: true })), '')).toBeUndefined();
    expect(selectAbsenceRecipient([recipients[1]], '')?.id).toBe('T2');
  });

  it('falls back to an explicit class teacher from the current profile', async () => {
    vi.stubGlobal('fetch', async (url: string) => url.endsWith('/message-types')
      ? Response.json({ MessageTypes: [ordinaryType, excuseType] })
      : Response.json({ Class: { Teacher: { Id: 'CLASS', Name: 'Class teacher' } } }));
    await expect(bakalariApi.getAbsenceExcuseRecipients()).resolves.toEqual([
      { id: 'CLASS', name: 'Class teacher', isDefault: true },
    ]);
  });

  it('rejects a general teacher or a class teacher with only a name', async () => {
    vi.stubGlobal('fetch', async (url: string) => url.endsWith('/message-types')
      ? Response.json({ MessageTypes: [ordinaryType, excuseType] })
      : Response.json({ Teacher: { Id: 'UNRELATED' }, ClassTeacher: 'Teacher name only' }));
    await expect(bakalariApi.getAbsenceExcuseRecipients()).resolves.toEqual([]);
  });

  it('can recover via the profile after a transient failure to load message types', async () => {
    vi.stubGlobal('fetch', async (url: string) => url.endsWith('/message-types')
      ? Response.json({})
      : Response.json({ ClassTeacher: { Code: 'CLASS', Name: 'Class teacher' } }));
    await expect(bakalariApi.getKomensMessageTypes()).resolves.toMatchObject({ loaded: false });
    await expect(bakalariApi.getAbsenceExcuseRecipients()).resolves.toEqual([
      { id: 'CLASS', name: 'Class teacher', isDefault: true },
    ]);
  });

  it('does not infer permission from the profile when the school omits the excuse type', async () => {
    const request = vi.fn(async () => Response.json({ MessageTypes: [ordinaryType] }));
    vi.stubGlobal('fetch', request);
    await expect(bakalariApi.getAbsenceExcuseRecipients()).resolves.toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('sends the selected ID and rejects empty, synthetic or group recipients before posting', async () => {
    const request = vi.fn(async (_url: string, _options: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', request);
    const message = { category: 'absence', recipientName: 'Selected teacher', title: 'Excuse', text: 'Synthetic excuse' };
    for (const recipients of [[], ['teacher-Name'], ['custom:Name'], ['T1', 'T2']]) {
      await expect(bakalariApi.sendMessage({ ...message, recipients })).rejects.toThrow(/verified teacher ID/);
    }
    await expect(bakalariApi.sendMessage({ ...message, recipients: ['T1'], recipientType: 'US' })).rejects.toThrow(/verified teacher ID/);
    expect(request).not.toHaveBeenCalled();
    await expect(bakalariApi.sendMessage({ ...message, recipients: ['T2'], recipientType: 'U' })).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0][1].body as string)).toMatchObject({ RecipientType: 'U', Recipients: ['T2'] });
  });
});
