import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// Usage: node scripts/release.js <minor|patch> [--dry-run]
// Bumps package.json, commits and tags locally. Pushing is left to the owner.
const [kind, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');

if (kind !== 'minor' && kind !== 'patch') {
  console.error('Usage: node scripts/release.js <minor|patch> [--dry-run]');
  process.exit(1);
}

const root = process.cwd();
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf-8' }).trim();
const pkgPath = path.join(root, 'package.json');

const [major, minor, patch] = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version.split('.').map(Number);
const next = kind === 'minor' ? [major, minor + 1, 0] : [major, minor, patch + 1];

if (next[1] > 99 || next[2] > 99) {
  console.error('minor and patch must stay at or below 99 (versionCode = major*10000 + minor*100 + patch).');
  process.exit(1);
}

const nextVersion = next.join('.');
const versionCode = next[0] * 10000 + next[1] * 100 + next[2];
console.log(`${major}.${minor}.${patch} -> ${nextVersion} (Android versionCode ${versionCode})`);

if (fs.readFileSync(path.join(root, 'public', 'privacypolicy.html'), 'utf-8').includes('CONTACT_EMAIL_PLACEHOLDER')) {
  console.warn('WARNING: public/privacypolicy.html still contains CONTACT_EMAIL_PLACEHOLDER.');
}

if (dryRun) process.exit(0);

if (run('git', ['status', '--porcelain'])) {
  console.error('Working tree is not clean. Commit or stash your changes first.');
  process.exit(1);
}

run('npm', ['version', nextVersion, '--no-git-tag-version']);
run('git', ['add', 'package.json', 'package-lock.json']);
run('git', ['commit', '-m', `chore(release): v${nextVersion}`]);
run('git', ['tag', '-a', `v${nextVersion}`, '-m', `v${nextVersion}`]);
console.log(`Committed and tagged v${nextVersion}. Push with: git push && git push origin v${nextVersion}`);
