/** Identifies a supported raster format from the first bytes of an image. */
export function rasterImageMime(header: Uint8Array): string | undefined {
  const startsWith = (bytes: number[]) => bytes.every((byte, index) => header[index] === byte);
  const ascii = String.fromCharCode(...header);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'image/gif';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';

  // AVIF is an ISO base media file. Its brand can be the major or a compatible brand.
  if (ascii.slice(4, 8) === 'ftyp' && header.length >= 16) {
    const boxSize = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(0);
    const isAvif = (offset: number) => ['avif', 'avis'].includes(ascii.slice(offset, offset + 4));
    if (boxSize >= 16 && isAvif(8)) return 'image/avif';
    for (let offset = 16; offset + 4 <= Math.min(boxSize, header.length); offset += 4) {
      if (isAvif(offset)) return 'image/avif';
    }
  }
  return undefined;
}
