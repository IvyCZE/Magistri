import type { BakalariAttachment } from '../types/bakalari';

export function canPreviewAttachment({ name, mimeType }: BakalariAttachment) {
  return /^image\/(?:png|jpeg|gif|webp)$/i.test(mimeType ?? '') || /\.(?:png|jpe?g|gif|webp)$/i.test(name);
}

/** The school and web proxy can both serve images as application/octet-stream. */
export async function attachmentImageBlob(blob: Blob): Promise<Blob> {
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const startsWith = (bytes: number[]) => bytes.every((byte, index) => header[index] === byte);
  const ascii = new TextDecoder().decode(header);
  let type: string;

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) type = 'image/png';
  else if (startsWith([0xff, 0xd8, 0xff])) type = 'image/jpeg';
  else if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) type = 'image/gif';
  else if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') type = 'image/webp';
  else throw new Error('Unsupported image attachment');

  return new Blob([blob], { type });
}
