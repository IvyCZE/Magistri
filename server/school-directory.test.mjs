import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SchoolDirectory, DirectoryUnavailable, matchesSchool } from './school-directory.mjs';

const school = { id: 'school-1', schoolUrl: 'https://school.example.invalid:8443/bakaweb/' };
const api = (base = school.schoolUrl) => new URL(`${base.replace(/\/$/, '')}/api/login`);
const catalog = {
  '/api/v1/municipality': [{ name: 'Town A' }, { name: 'Town B' }],
  '/api/v1/municipality/Town%20A': { schools: [{ id: 'other', schoolUrl: 'https://other.example.invalid/' }] },
  '/api/v1/municipality/Town%20B': { schools: [school] },
};

test('an official school ID automatically authorizes its custom host, port and prefix', async () => {
  const calls = [];
  const directory = new SchoolDirectory({ loadJson: async (route) => { calls.push(route); return school; } });
  assert.equal((await directory.find(api(), school.id)).id, school.id);
  assert.equal((await directory.find(api(), school.id)).id, school.id);
  assert.deepEqual(calls, ['/api/v1/school/school-1']);
  assert.equal(await directory.find(api('https://evil.invalid/bakaweb'), school.id), null);
  assert.equal(await directory.find(api('https://school.example.invalid:9443/bakaweb'), school.id), null);
  assert.equal(await directory.find(api('https://school.example.invalid:8443/other'), school.id), null);
});

test('normal school-list searches also authorize every listed custom school', async () => {
  const directory = new SchoolDirectory({ loadJson: async (route) => { assert.equal(route, '/api/v1/municipality/Town'); return { schools: [school] }; } });
  await directory.response('/api/v1/municipality/Town');
  assert.equal((await directory.find(api())).id, school.id);
});

test('direct URLs and old sessions resolve automatically, with shared catalog requests', async () => {
  const calls = [];
  const directory = new SchoolDirectory({ loadJson: async (route) => { calls.push(route); return catalog[route]; } });
  const results = await Promise.all([directory.find(api()), directory.find(api()), directory.find(api())]);
  assert.ok(results.every((s) => s.id === school.id));
  await directory.scan;
  assert.equal(calls.length, 3);
  assert.equal(await directory.find(api('https://not-a-school.invalid')), null);
  assert.equal(calls.length, 3);
});

test('a cached catalog survives server restarts without requiring a search or network access', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'magistri-directory-test-'));
  const cacheFile = path.join(folder, 'schools.json');
  try {
    const first = new SchoolDirectory({ cacheFile, loadJson: async (route) => catalog[route] });
    assert.equal((await first.find(api())).id, school.id);
    await first.scan;
    first.flush();
    const restarted = new SchoolDirectory({ cacheFile, loadJson: async () => assert.fail('must use persisted public directory') });
    assert.equal((await restarted.find(api())).id, school.id);
    assert.equal(await restarted.find(api('https://evil.invalid')), null);
    clearTimeout(first.saveTimer); clearTimeout(restarted.saveTimer);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('directory outages do not authorize an unknown school or mark an incomplete catalog fresh', async () => {
  const directory = new SchoolDirectory({ loadJson: async (route) => {
    if (route === '/api/v1/municipality/Town%20B') throw new DirectoryUnavailable('unavailable');
    return catalog[route];
  } });
  await assert.rejects(directory.find(api()), DirectoryUnavailable);
  assert.equal(directory.completeAt, 0);
  await assert.rejects(directory.find(api()), DirectoryUnavailable);
});

test('expired approvals are checked again, and concurrent city fetches remain bounded', async () => {
  let now = Date.now();
  let active = 0, peak = 0;
  const directory = new SchoolDirectory({ now: () => now, concurrency: 2, loadJson: async (route) => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1)); active--;
    return catalog[route];
  } });
  await directory.find(api()); await directory.scan;
  assert.ok(peak <= 2);
  now += 25 * 60 * 60 * 1000;
  assert.equal((await directory.find(api())).id, school.id);
});

test('school matching preserves directory prefixes and upgrades legacy HTTP listings to HTTPS', () => {
  assert.equal(matchesSchool(api(), school.schoolUrl), true);
  assert.equal(matchesSchool(api('https://evil.invalid/bakaweb'), school.schoolUrl), false);
  assert.equal(matchesSchool(api('https://school.example.invalid/bakaweb'), 'http://school.example.invalid/bakaweb/'), true);
});

test('temporarily unavailable directory does not break an already verified school', async () => {
  let now = Date.now();
  const directory = new SchoolDirectory({ now: () => now, loadJson: async () => { throw new DirectoryUnavailable('unavailable'); } });
  directory.remember(school);
  now += 25 * 60 * 60 * 1000;
  assert.equal((await directory.find(api(), school.id)).id, school.id);
  await assert.rejects(directory.find(api('https://evil.invalid'), school.id), DirectoryUnavailable);
  now += 7 * 24 * 60 * 60 * 1000;
  await assert.rejects(directory.find(api(), school.id), DirectoryUnavailable);
});
