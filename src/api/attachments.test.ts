// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseAttachments } from './client';

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
