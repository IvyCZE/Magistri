import type { BakalariAttachment } from '../types/bakalari';
import { rasterImageMime } from './rasterImage';

export function canPreviewAttachment({ name, mimeType }: BakalariAttachment) {
  return /^image\/(?:png|jpeg|gif|webp)$/i.test(mimeType ?? '') || /\.(?:png|jpe?g|gif|webp)$/i.test(name);
}

/** The school and web proxy can both serve images as application/octet-stream. */
export async function attachmentImageBlob(blob: Blob): Promise<Blob> {
  const type = rasterImageMime(new Uint8Array(await blob.slice(0, 64).arrayBuffer()));
  if (!type) throw new Error('Unsupported image attachment');

  return new Blob([blob], { type });
}
