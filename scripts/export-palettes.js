// Exports the accent palettes from src/index.css to an Android asset, so the CSS
// stays the single source of truth for widget colors.
//
//   node scripts/export-palettes.js          writes the asset
//   node scripts/export-palettes.js --check  exits 1 when the asset is out of date
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = resolve(root, 'src/index.css');
const outPath = resolve(root, 'android/app/src/main/assets/palettes.json');

const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function parseBlocks(css) {
  const blocks = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) {
    const vars = {};
    for (const d of m[2].matchAll(/--m3-([a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[camel(d[1])] = d[2].toLowerCase();
    if (Object.keys(vars).length) blocks.push({ selector: m[1].split(';').pop().trim().replace(/\s+/g, ' '), vars });
  }
  return blocks;
}

export function buildPalettes(css) {
  const blocks = parseBlocks(css);
  const find = (selector) => {
    const block = blocks.find((b) => b.selector === selector);
    if (!block) throw new Error(`Selector not found in index.css: ${selector}`);
    return block.vars;
  };

  const baseLight = find(':root');
  const baseDark = { ...baseLight, ...find('.dark, [data-theme-mode="dark"]') };
  const amoled = find('[data-amoled="true"].dark');

  const palettes = {};
  for (const accent of ['sakura', 'lavender', 'ocean', 'emerald', 'amber']) {
    // Sakura is the base theme and has no accent blocks of its own.
    const light = accent === 'sakura' ? baseLight : { ...baseLight, ...find(`[data-accent="${accent}"]:not(.dark)`) };
    const dark = accent === 'sakura' ? baseDark : { ...baseDark, ...find(`[data-accent="${accent}"].dark`) };
    palettes[accent] = { light, dark, amoled: { ...dark, ...amoled } };
  }
  return palettes;
}

const render = () => JSON.stringify(buildPalettes(readFileSync(cssPath, 'utf8')), null, 2) + '\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = render();
  if (process.argv.includes('--check')) {
    if (!existsSync(outPath) || readFileSync(outPath, 'utf8') !== text) {
      console.error('palettes.json is out of date. Run: node scripts/export-palettes.js');
      process.exit(1);
    }
  } else {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, text);
    console.log(`Wrote ${outPath}`);
  }
}
