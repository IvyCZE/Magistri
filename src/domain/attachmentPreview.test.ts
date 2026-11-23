import { expect, it } from 'vitest';
import { attachmentImageBlob, canPreviewAttachment } from './attachmentPreview';

it('recognizes raster images by extension or attachment metadata', () => {
  expect(canPreviewAttachment({ id: '1', name: 'Obrázek.PNG' })).toBe(true);
  expect(canPreviewAttachment({ id: '2', name: 'fotografie', mimeType: 'image/jpeg' })).toBe(true);
  expect(canPreviewAttachment({ id: '3', name: 'list.docx' })).toBe(false);
  expect(canPreviewAttachment({ id: '4', name: 'diagram.svg', mimeType: 'image/svg+xml' })).toBe(false);
});

it('adds the decoded raster MIME type to an octet-stream download', async () => {
  const image = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'application/octet-stream' });
  const preview = await attachmentImageBlob(image);
  expect(preview.type).toBe('image/png');
  expect(await preview.arrayBuffer()).toEqual(await image.arrayBuffer());
});

it('rejects content with an image MIME type when the bytes are a document', async () => {
  await expect(attachmentImageBlob(new Blob(['<svg></svg>'], { type: 'image/png' }))).rejects.toThrow();
});
