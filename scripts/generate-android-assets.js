import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { logoSvg } from './lib/logo.js';

// Renders the source artwork for `capacitor-assets generate --android` into ./assets, from the
// logo in src/config/logo.json. The adaptive icon itself (vector layers, themed icon) is written
// by generate-android-vectors.js, which runs after capacitor-assets.
const outDir = path.resolve(process.cwd(), 'assets');
fs.mkdirSync(outDir, { recursive: true });

const render = (name, svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(outDir, name));

// Legacy launchers (Android 7.x) show this full icon; the logo circle fills most of it.
await render('icon-only.png', logoSvg({ shape: 'square', circleScale: 0.78 }), 1024);
await render('icon-background.png', logoSvg({ shape: 'square', glyph: 'none' }), 1024);
// 72dp of the 108dp adaptive layer stay visible under every mask.
await render('icon-foreground.png', logoSvg({ shape: 'none', circleScale: 72 / 108 }), 1024);

// Surfaces of the default (ocean) accent in src/index.css; the Android launch theme uses the same
// colours (res/values/colors.xml and values-night/colors.xml).
const splash = (surface) =>
  sharp(Buffer.from(logoSvg({ size: 2732, shape: 'circle', circleScale: 0.2, canvasBackground: surface })))
    .resize(2732, 2732)
    .png();
await splash('#f7fbfd').toFile(path.join(outDir, 'splash.png'));
await splash('#0e1417').toFile(path.join(outDir, 'splash-dark.png'));

console.log('Android source assets written to', outDir);
