import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Report locations, never the matched secrets or private text.
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const failures = [];
const rules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['Google API key', /AIza[A-Za-z0-9_-]{35}/],
];
for (const file of files) {
  if (/(^|\/)(?:\.env(?:\..*)?|(?:keystore|local)\.properties|id_(?:rsa|ed25519))$|\.(?:jks|keystore|p12|pfx|pem|key|apk|aab)$/i.test(file) && !/(?:\.example)$/.test(file)) failures.push(`${file}: private/generated file`);
  if (/^fixtures\/(?:private|bakalari-real)(?:\/|$)/.test(file)) failures.push(`${file}: private capture`);
  if (/^scripts\/probe-.*\.mjs$/.test(file)) failures.push(`${file}: local API probe`);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) continue;
  const text = buffer.toString('utf8');
  for (const [name, rule] of rules) {
    const match = rule.exec(text);
    if (match) failures.push(`${file}:${text.slice(0, match.index).split('\n').length}: ${name}`);
  }
  if (file.startsWith('fixtures/')) {
    if (/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i.test(text)) failures.push(`${file}: email candidate in fixture`);
    if (/https?:\/\/[^\s"<>]+/i.test(text)) failures.push(`${file}: URL candidate in fixture`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`Checked ${files.length} public files. No recognized secret patterns or private capture paths.`);
