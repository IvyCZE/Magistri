import fs from 'node:fs';
import path from 'node:path';

const DAY = 24 * 60 * 60 * 1000;
export class DirectoryUnavailable extends Error {}

export function schoolBase(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    url.protocol = 'https:';
    const prefix = url.pathname.replace(/\/+(login(\.aspx)?|api(\/login)?|next(\/.*)?|3(\/.*)?)*$/i, '').replace(/\/+$/, '');
    return url.origin + prefix;
  } catch { return null; }
}

export const matchesSchool = (target, schoolUrl) => {
  const base = schoolBase(schoolUrl);
  return base !== null && target.href.startsWith(`${base}/api/`);
};

/** Only HTTPS responses from the official directory populate this registry. */
export class SchoolDirectory {
  constructor({ loadJson, cacheFile, now = Date.now, concurrency = 6 }) {
    this.loadJson = loadJson;
    this.cacheFile = cacheFile;
    this.now = now;
    this.concurrency = Math.max(1, Math.min(8, concurrency));
    this.records = new Map();
    this.responses = new Map();
    this.pending = new Map();
    this.listeners = new Set();
    this.completeAt = 0;
    this.retryAt = 0;
    if (cacheFile) {
      try {
        const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (data.version === 1 && Array.isArray(data.schools)) {
          for (const record of data.schools) this.remember(record, record.checkedAt);
          if (Number.isFinite(data.completeAt) && data.completeAt <= now()) this.completeAt = data.completeAt;
        }
      } catch { /* A missing/unwritable cache never requires host configuration. */ }
    }
  }

  remember(school, checkedAt = this.now()) {
    if (!school || typeof school.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(school.id) || !Number.isFinite(checkedAt) || checkedAt > this.now()) return;
    const base = schoolBase(school.schoolUrl);
    if (!base) return;
    this.records.set(base, { id: school.id, schoolUrl: base, checkedAt });
    for (const listener of this.listeners) listener();
    if (this.cacheFile && !this.saveTimer) {
      this.saveTimer = setTimeout(() => { this.saveTimer = undefined; this.flush(); }, 1000);
      this.saveTimer.unref();
    }
  }

  flush() {
    if (!this.cacheFile) return;
    try {
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true, mode: 0o700 });
      const temp = `${this.cacheFile}.${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ version: 1, completeAt: this.completeAt, schools: [...this.records.values()] }), { mode: 0o600 });
      fs.renameSync(temp, this.cacheFile);
    } catch { /* Keep serving from memory if the filesystem is read-only. */ }
  }

  cached(target, maxAge = DAY) {
    return [...this.records.values()].find((record) => this.now() - record.checkedAt < maxAge && matchesSchool(target, record.schoolUrl));
  }

  async response(route) {
    const cached = this.responses.get(route);
    if (cached && this.now() - cached.at < DAY) return cached.data;
    if (this.pending.has(route)) return this.pending.get(route);
    const pending = (async () => {
      const data = await this.loadJson(route);
      if (data === null) {
        if (this.responses.size >= 4096) this.responses.delete(this.responses.keys().next().value);
        this.responses.set(route, { data: null, at: this.now() });
        return null;
      }
      const towns = route === '/api/v1/municipality';
      if (towns ? !Array.isArray(data) || !data.length : !data || typeof data !== 'object') throw new DirectoryUnavailable('Invalid school directory response.');
      if (route.startsWith('/api/v1/school/')) this.remember(data);
      else if (!towns) {
        if (!Array.isArray(data.schools)) throw new DirectoryUnavailable('Invalid school list.');
        data.schools.forEach((school) => this.remember(school));
      }
      // Bound arbitrary school-id/city lookups; catalog records are kept separately.
      if (this.responses.size >= 4096) this.responses.delete(this.responses.keys().next().value);
      this.responses.set(route, { data, at: this.now() });
      return data;
    })();
    this.pending.set(route, pending);
    try { return await pending; } finally { this.pending.delete(route); }
  }

  catalog() {
    if (this.scan) return this.scan;
    if (this.now() < this.retryAt) return Promise.reject(new DirectoryUnavailable('School directory is temporarily unavailable.'));
    this.scan = (async () => {
      const towns = await this.response('/api/v1/municipality');
      if (!Array.isArray(towns)) throw new DirectoryUnavailable('School directory is temporarily unavailable.');
      let index = 0;
      let failed = false;
      await Promise.all(Array.from({ length: this.concurrency }, async () => {
        while (index < towns.length) {
          const town = towns[index++];
          if (typeof town.name !== 'string') { failed = true; continue; }
          try {
            if (!await this.response(`/api/v1/municipality/${encodeURIComponent(town.name || ' ')}`)) failed = true;
          } catch { failed = true; }
        }
      }));
      if (failed) throw new DirectoryUnavailable('School directory is temporarily unavailable.');
      this.completeAt = this.now();
      this.flush();
    })().catch((error) => {
      this.retryAt = this.now() + 60000;
      throw error;
    }).finally(() => { this.scan = undefined; });
    return this.scan;
  }

  async find(target, schoolId) {
    try { return await this.findFresh(target, schoolId); }
    catch (error) {
      const previous = this.cached(target, 7 * DAY);
      if (error instanceof DirectoryUnavailable && previous) return previous;
      throw error;
    }
  }

  async findFresh(target, schoolId) {
    const cached = this.cached(target);
    if (cached) return cached;
    if (schoolId && /^[a-z0-9_-]{1,80}$/i.test(schoolId)) {
      const school = await this.response(`/api/v1/school/${encodeURIComponent(schoolId)}`);
      if (school) return matchesSchool(target, school.schoolUrl) ? this.cached(target) : null;
    }
    if (this.completeAt && this.now() - this.completeAt < DAY) return null;
    // Old saved sessions and direct URLs have no id yet. Search the catalog
    // once, with bounded concurrency; return as soon as this school is found.
    let listener;
    const found = new Promise((resolve) => {
      listener = () => { const school = this.cached(target); if (school) resolve(school); };
      this.listeners.add(listener);
    });
    try { return await Promise.race([found, this.catalog().then(() => this.cached(target) || null)]); }
    finally { this.listeners.delete(listener); }
  }
}
