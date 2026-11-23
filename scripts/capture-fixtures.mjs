// Downloads the responses the app parses from a real Bakaláři account, anonymises them and writes
// them outside the repository under ~/bakalari-captures/<run>/raw by default. Optional local
// parser tests use fixtures/bakalari-real/raw, which is ignored by Git.
// Nothing un-anonymised is written to disk, and the password and tokens are never saved.
//
//   BAKA_URL=https://skola.example.cz node scripts/capture-fixtures.mjs
//   (the user name and the password are asked for, the password hidden; or set BAKA_USER / BAKA_PASS;
//   BAKA_OUT=/some/dir overrides the default output directory)
//
// Then:  UPDATE_FIXTURES=1 npx vitest run src/api/apiParsing.test.ts   (writes the expected files)
//        npm test, and the Android tests (./gradlew :app:testDebugUnitTest)
// Keep all real school responses private, including anonymized captures.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { createAnonymizer } from './lib/anonymize.js';

// A capture must never overwrite the committed fixture set by default.
const outDir = process.env.BAKA_OUT
  ? path.resolve(process.env.BAKA_OUT)
  : path.join(os.homedir(), 'bakalari-captures', new Date().toISOString().replace(/[:.]/g, '-'), 'raw');
const force = process.argv.includes('--force');
// Keeps the endpoints that worked when others fail (a school server may answer 500 for one of them).
const partial = process.argv.includes('--partial');
// Same value as BAKALARI_CLIENT_ID in src/api/client.ts (a test keeps them equal).
const CLIENT_ID = 'ANDR';

function normalizeSchoolUrl(url) {
  let cleaned = (url || '').trim();
  if (!cleaned) return '';
  if (!/^https?:\/\//i.test(cleaned)) cleaned = `https://${cleaned}`;
  return cleaned.replace(/\/+(login(\.aspx)?|api(\/login)?|next(\/.*)?|3(\/.*)?)*$/i, '').replace(/\/+$/, '');
}

function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const write = rl._writeToOutput;
      rl._writeToOutput = (s) => {
        if (s.startsWith(question)) write.call(rl, s);
        else if (/[\r\n]/.test(s)) write.call(rl, s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const base = normalizeSchoolUrl(process.env.BAKA_URL);
if (!base) {
  console.error('Set BAKA_URL (school address). The user name and password are asked for.');
  process.exit(1);
}
if (!base.startsWith('https://')) {
  console.error('The school address must use https.');
  process.exit(1);
}
const user = (process.env.BAKA_USER || (await ask('User name: ', false))).trim();
if (!user) {
  console.error('No user name given.');
  process.exit(1);
}
const password = process.env.BAKA_PASS || (await ask('Password: ', true));

const headers = { 'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8' };

const login = await fetch(`${base}/api/login`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'password', username: user, password }),
});
if (!login.ok) {
  console.error(`Login failed (${login.status}).`);
  process.exit(1);
}
const accessToken = (await login.json()).access_token;
if (!accessToken) {
  console.error('Login did not return a token.');
  process.exit(1);
}

async function get(pathname, post = false) {
  const res = await fetch(`${base}${pathname}`, {
    method: post ? 'POST' : 'GET',
    headers: { ...headers, Accept: 'application/json', Authorization: `Bearer ${accessToken}`, ...(post ? { 'Content-Type': 'application/json' } : {}) },
    body: post ? '{}' : undefined,
  });
  if (!res.ok) throw new Error(`${pathname} answered ${res.status}`);
  return res.json();
}

const endpoints = {
  'timetable-actual.json': ['/api/3/timetable/actual'],
  'timetable-permanent.json': ['/api/3/timetable/permanent'],
  'marks.json': ['/api/3/marks'],
  'absence.json': ['/api/3/absence/student'],
  'homeworks.json': ['/api/3/homeworks'],
  'events.json': ['/api/3/events'],
  'komens-received.json': ['/api/3/komens/messages/received', true],
  'komens-noticeboard.json': ['/api/3/komens/messages/noticeboard', true],
};

const documents = {};
const failed = [];
for (const [file, [url, post]] of Object.entries(endpoints)) {
  try {
    documents[file] = await get(url, post);
    console.log(`fetched ${url}`);
  } catch (e) {
    if (!partial) {
      console.error(`${e.message}. Nothing written (use --partial to keep the other files).`);
      process.exit(1);
    }
    console.error(`${e.message}. Skipped.`);
    failed.push(url);
  }
}
if (Object.keys(documents).length === 0) {
  console.error('Nothing could be downloaded.');
  process.exit(1);
}

const anonymizer = createAnonymizer();
const output = anonymizer.run(documents);
const leaks = anonymizer.leakLocations(output, [user]);
if (leaks.length > 0) {
  console.error('Words from the original data are still in the output, at these places:');
  for (const { token, path: where } of leaks.slice(0, 40)) console.error(`  ${token}  ${where}`);
  if (leaks.length > 40) console.error(`  ... and ${leaks.length - 40} more`);
  if (!force) {
    console.error('Nothing written. Fix the anonymiser or run again with --force after checking by hand.');
    process.exit(1);
  }
}

fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
for (const [file, doc] of Object.entries(output)) {
  fs.writeFileSync(path.join(outDir, file), `${JSON.stringify(doc, null, 1)}\n`, { mode: 0o600 });
}
console.log(`\nWritten to ${path.relative(process.cwd(), outDir)}.`);
if (failed.length > 0) console.log(`Not captured: ${failed.join(', ')}`);
console.log('Keep the capture private. The optional local fixture directory is fixtures/bakalari-real/raw.');
console.log('Then: UPDATE_FIXTURES=1 npx vitest run src/api/apiParsing.test.ts');
