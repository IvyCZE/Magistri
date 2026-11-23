import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const sections = ['Magistři — Third-party notices\n\nGenerated from package-lock.json by npm run licenses.\nProject attribution: Copyright (C) 2026 Jan Hrudka (IvyCZ).\nThird-party components retain the following notices and licenses.'];
for (const [location, info] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  if (!location || (info.dev && !/node_modules\/workbox-[^/]+$/.test(location))) continue;
  const directory = path.join(root, location);
  if (!fs.existsSync(directory)) {
    if (info.optional) continue;
    throw new Error(`Missing package: ${location}. Run npm ci first.`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const files = fs.readdirSync(directory).filter((name) => /^(licen[cs]e|copying|notice)(?:[.-].*)?$/i.test(name) && fs.statSync(path.join(directory, name)).isFile()).sort();
  if (!files.length) throw new Error(`No license text found for ${pkg.name}; review it before distribution.`);
  sections.push(`\n${'='.repeat(72)}\n${pkg.name} ${pkg.version}\nLicense: ${info.license || pkg.license || 'See notices below'}\n\n` + files.map((name) => `--- ${name} ---\n${fs.readFileSync(path.join(directory, name), 'utf8').trim()}`).join('\n\n'));
}
const content = sections.join('\n\n') + '\n';
const output = path.join(root, 'public/third-party-notices.txt');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== content) throw new Error('Third-party notices are stale. Run npm run licenses.');
} else fs.writeFileSync(output, content);
