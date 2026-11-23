import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { logoSvg } from './lib/logo.js';

// Web icons from the logo in src/config/logo.json: the SVG favicon, the PWA icons and the
// Apple touch icon. Run with `node scripts/generate-icons.js`.
const publicDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });

const circle = logoSvg({ shape: 'circle' });
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), circle);
fs.writeFileSync(path.join(publicDir, 'icon.svg'), circle);

const png = (name, svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(publicDir, name));

await png('icon-512.png', circle, 512);
await png('icon-192.png', circle, 192);
// Maskable: the system crops to its own shape, so the backdrop fills the canvas and the logo
// circle stays inside the central 80% safe zone.
await png('icon-maskable-512.png', logoSvg({ shape: 'square', circleScale: 0.8 }), 512);
// iOS rounds the corners itself and does not accept transparency.
await png('apple-touch-icon.png', logoSvg({ shape: 'square', circleScale: 0.86 }), 180);
// Browsers accept PNG data in a .ico file.
await png('favicon.ico', circle, 48);

console.log('Web icons written to', publicDir);
