import fs from 'fs';
import path from 'path';

// The logo is a grey "m" on a blue badge inside a dark circle. Its geometry and colours live in
// src/config/logo.json, which the app also imports for its theme-coloured logo.
const logo = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/config/logo.json'), 'utf-8'));

export const LOGO_SIZE = logo.viewBox;
export const GLYPH_PATH = logo.glyphPath;
export const LOGO_BACKGROUND = logo.background;
export const LOGO_GLYPH = logo.glyph;
export const LOGO_DECORATION = logo.decoration;
export const DECORATION_PATH = logo.decorationPath;

// Where the glyph sits in the logo circle: the middle of its bounding box.
export const GLYPH_CENTER = logo.glyphCenter;
export const GLYPH_WIDTH = logo.glyphWidth;

/**
 * Standalone SVG of the logo. `circleScale` is the diameter of the logo circle as a share of the
 * canvas: 1 fills it, smaller values leave room around it (safe zones). `shape` is the backdrop:
 * a circle, a full square, or none (glyph only).
 */
export function logoSvg({ size = 512, shape = 'circle', circleScale = 1, background = LOGO_BACKGROUND, glyph = LOGO_GLYPH, canvasBackground } = {}) {
  const k = LOGO_SIZE;
  const offset = (k - k * circleScale) / 2;
  const half = k / 2;
  const backdrop =
    shape === 'circle'
      ? `<circle cx="${half}" cy="${half}" r="${logo.circleRadius}" fill="${background}"/>`
      : shape === 'square'
        ? `<rect x="${-k}" y="${-k}" width="${3 * k}" height="${3 * k}" fill="${background}"/>`
        : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${k} ${k}" width="${size}" height="${size}">
  ${canvasBackground ? `<rect x="${-k}" y="${-k}" width="${3 * k}" height="${3 * k}" fill="${canvasBackground}"/>` : ''}
  <g transform="translate(${offset} ${offset}) scale(${circleScale})">
    ${backdrop}
    ${glyph !== 'none' ? `<path d="${DECORATION_PATH}" fill="${LOGO_DECORATION}"/>` : ''}
    <path d="${GLYPH_PATH}" fill="${glyph}"/>
  </g>
</svg>
`;
}

/** Android VectorDrawable of the glyph, positioned like the logo circle of `circleDp` on a 108dp adaptive layer. */
export function adaptiveGlyphVector(fillColor, circleDp = 72, monochrome = false) {
  const s = circleDp / LOGO_SIZE;
  const t = (108 - circleDp) / 2;
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:scaleX="${s.toFixed(5)}"
        android:scaleY="${s.toFixed(5)}"
        android:translateX="${t}"
        android:translateY="${t}">
        ${monochrome
          ? `<path android:fillColor="${fillColor}" android:fillType="evenOdd" android:pathData="${DECORATION_PATH} ${GLYPH_PATH}" />`
          : `<path android:fillColor="${LOGO_DECORATION}" android:pathData="${DECORATION_PATH}" />
        <path android:fillColor="${fillColor}" android:pathData="${GLYPH_PATH}" />`}
    </group>
</vector>
`;
}

/** Android VectorDrawable of the glyph alone, scaled to `widthDp` and centred in a 24dp box (status bar icon). */
export function statusGlyphVector(widthDp = 22) {
  const s = widthDp / GLYPH_WIDTH;
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <group
        android:scaleX="${s.toFixed(5)}"
        android:scaleY="${s.toFixed(5)}"
        android:translateX="${(12 - GLYPH_CENTER.x * s).toFixed(3)}"
        android:translateY="${(12 - GLYPH_CENTER.y * s).toFixed(3)}">
        <path
            android:fillColor="#FFFFFFFF"
            android:pathData="${GLYPH_PATH}" />
    </group>
</vector>
`;
}
